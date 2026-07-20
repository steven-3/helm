use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;
use tauri::Emitter;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::fs::expand_home;

/// Whisper GGML models are fetched from the upstream whisper.cpp repository on
/// Hugging Face; `model_id` is validated and interpolated into this template,
/// never used as a URL or path directly.
const MODEL_URL_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const DOWNLOAD_EVENT: &str = "voice://download";
/// Progress events fire at most once per this many bytes (plus start/finish).
const PROGRESS_STRIDE: u64 = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcription {
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedModel {
    pub path: String,
}

/// Payload shape is a frontend contract (`useVoice` subscribes):
/// `{modelId, received, total, done?, path?, error?}`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    model_id: String,
    received: u64,
    /// None when the server does not announce a Content-Length.
    total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    done: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Spawns whisper-cli (whisper.cpp) on a 16 kHz mono wav and returns the
/// transcript. The heavy inference runs on a blocking thread so the async
/// runtime stays responsive.
#[tauri::command]
pub async fn voice_transcribe(
    wav_path: String,
    model_path: String,
    binary_path: String,
) -> Result<Transcription, String> {
    let wav = expand_home(&wav_path);
    let model = expand_home(&model_path);
    let binary = expand_home(&binary_path);
    if !wav.is_file() {
        return Err(format!("wav file not found: {}", wav.display()));
    }
    if !model.is_file() {
        return Err(format!("model file not found: {}", model.display()));
    }
    if !binary.is_file() {
        return Err(format!("whisper binary not found: {}", binary.display()));
    }

    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(&binary);
        command
            .arg("-m")
            .arg(&model)
            .arg("-f")
            .arg(&wav)
            // Plain text on stdout: no timestamps, no banner/progress prints.
            .arg("--no-timestamps")
            .arg("--no-prints");
        #[cfg(windows)]
        command.creation_flags(crate::sys::CREATE_NO_WINDOW);
        command.output()
    })
    .await
    .map_err(|error| format!("transcription task failed: {error}"))?
    .map_err(|error| format!("failed to run whisper-cli: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!("whisper-cli exited with status {:?}", output.status.code())
        } else {
            format!("whisper-cli failed: {detail}")
        });
    }

    Ok(Transcription {
        text: parse_transcript(&String::from_utf8_lossy(&output.stdout)),
    })
}

/// Streams a GGML model into `dest_dir/ggml-<model_id>.bin`, emitting
/// `voice://download` progress events. Downloads land in a `.part` temp file
/// and are renamed into place only when complete.
#[tauri::command]
pub async fn voice_download_model(
    app: tauri::AppHandle,
    model_id: String,
    dest_dir: String,
) -> Result<DownloadedModel, String> {
    validate_model_id(&model_id)?;
    let dest_dir = expand_home(&dest_dir);
    fs::create_dir_all(&dest_dir)
        .map_err(|error| format!("failed to create {}: {error}", dest_dir.display()))?;

    let file_name = format!("ggml-{model_id}.bin");
    let target = dest_dir.join(&file_name);
    let temp = dest_dir.join(format!("{file_name}.part"));
    let url = format!("{MODEL_URL_BASE}/{file_name}");

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;
    let mut response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("model download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("model download failed: {error}"))?;

    let total = response.content_length();
    let mut file = fs::File::create(&temp)
        .map_err(|error| format!("failed to create {}: {error}", temp.display()))?;
    let mut received: u64 = 0;
    let mut last_reported: u64 = 0;
    emit_progress(&app, &model_id, 0, total);

    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                let _ = fs::remove_file(&temp);
                let message = format!("model download interrupted: {error}");
                emit_error(&app, &model_id, received, total, &message);
                return Err(message);
            }
        };
        if let Err(error) = file.write_all(&chunk) {
            let _ = fs::remove_file(&temp);
            let message = format!("failed to write {}: {error}", temp.display());
            emit_error(&app, &model_id, received, total, &message);
            return Err(message);
        }
        received += chunk.len() as u64;
        if received - last_reported >= PROGRESS_STRIDE {
            last_reported = received;
            emit_progress(&app, &model_id, received, total);
        }
    }
    drop(file);

    replace_file(&temp, &target)?;
    let path = target.to_string_lossy().into_owned();
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DownloadProgress {
            model_id: model_id.clone(),
            received,
            total,
            done: Some(true),
            path: Some(path.clone()),
            error: None,
        },
    );
    Ok(DownloadedModel { path })
}

fn emit_progress(app: &tauri::AppHandle, model_id: &str, received: u64, total: Option<u64>) {
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DownloadProgress {
            model_id: model_id.to_string(),
            received,
            total,
            done: None,
            path: None,
            error: None,
        },
    );
}

fn emit_error(
    app: &tauri::AppHandle,
    model_id: &str,
    received: u64,
    total: Option<u64>,
    message: &str,
) {
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DownloadProgress {
            model_id: model_id.to_string(),
            received,
            total,
            done: None,
            path: None,
            error: Some(message.to_string()),
        },
    );
}

/// Model ids look like `base.en`, `large-v3-turbo`, `small.en-q5_1`. Anything
/// outside that character set (separators especially) is rejected so the id
/// can never alter the URL or the destination path.
fn validate_model_id(model_id: &str) -> Result<(), String> {
    let valid = !model_id.is_empty()
        && model_id.len() <= 64
        && model_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
        && !model_id.starts_with('.');
    if valid {
        Ok(())
    } else {
        Err(format!("invalid model id: {model_id}"))
    }
}

/// whisper-cli with --no-timestamps --no-prints emits the transcript as plain
/// stdout lines. Defensively strip `[.. --> ..]` timestamp prefixes too, in
/// case an older binary ignores the flag.
fn parse_transcript(stdout: &str) -> String {
    let mut lines = Vec::new();
    for raw in stdout.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let line = if line.starts_with('[') {
            match line.split_once(']') {
                Some((prefix, rest)) if prefix.contains("-->") => rest.trim(),
                _ => line,
            }
        } else {
            line
        };
        if !line.is_empty() {
            lines.push(line.to_string());
        }
    }
    lines.join("\n")
}

fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    if fs::rename(temp, target).is_ok() {
        return Ok(());
    }
    // Windows rename fails when the destination exists; retry after removal.
    let _ = fs::remove_file(target);
    fs::rename(temp, target).map_err(|error| {
        let _ = fs::remove_file(temp);
        format!("failed to move model into {}: {error}", target.display())
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_transcript, validate_model_id};

    #[test]
    fn validates_model_ids() {
        assert!(validate_model_id("base.en").is_ok());
        assert!(validate_model_id("large-v3-turbo").is_ok());
        assert!(validate_model_id("small.en-q5_1").is_ok());
        assert!(validate_model_id("../evil").is_err());
        assert!(validate_model_id("a/b").is_err());
        assert!(validate_model_id("").is_err());
        assert!(validate_model_id(".hidden").is_err());
    }

    #[test]
    fn parses_plain_and_timestamped_transcripts() {
        assert_eq!(parse_transcript(" hello world \n"), "hello world");
        assert_eq!(
            parse_transcript("[00:00:00.000 --> 00:00:02.000]  hi there\n"),
            "hi there"
        );
        assert_eq!(parse_transcript("[unrelated] text"), "[unrelated] text");
    }
}
