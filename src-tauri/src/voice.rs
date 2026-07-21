use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, Manager};

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

/// Managed whisper-cli setup: pinned known-good prebuilt for Windows x64.
/// (ggml-org is the canonical home of the former ggerganov/whisper.cpp repo.)
const WHISPER_CLI_VERSION: &str = "v1.9.1";
const WHISPER_CLI_ZIP_URL: &str =
    "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip";
/// Model the managed setup installs alongside the binary.
const SETUP_MODEL_ID: &str = "base";

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSetupResult {
    pub binary_path: String,
    pub model_path: String,
}

/// Payload shape is a frontend contract (`useVoice` subscribes):
/// `{modelId, received, total, stage?, done?, path?, error?}`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    model_id: String,
    received: u64,
    /// None when the server does not announce a Content-Length.
    total: Option<u64>,
    /// Present during voice_setup_whisper: "binary" | "model".
    #[serde(skip_serializing_if = "Option::is_none")]
    stage: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    done: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Spawns whisper-cli (whisper.cpp) on a 16 kHz mono wav and returns the
/// transcript. `prompt` (optional) is passed as `--prompt` to bias recognition
/// toward domain vocabulary (hotwords). The heavy inference runs on a blocking
/// thread so the async runtime stays responsive.
#[tauri::command]
pub async fn voice_transcribe(
    wav_path: String,
    model_path: String,
    binary_path: String,
    prompt: Option<String>,
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
        command.args(transcribe_args(&model, &wav, prompt.as_deref()));
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
    let target = download_model_into(&app, &model_id, &expand_home(&dest_dir), None).await?;
    Ok(DownloadedModel {
        path: target.to_string_lossy().into_owned(),
    })
}

/// Fully managed whisper setup: pinned whisper-cli prebuilt + the base model
/// into `app_data_dir/whisper/`. Idempotent — anything already present (size
/// > 0) is kept. Progress rides the existing `voice://download` channel with
/// `stage: "binary" | "model"`.
#[tauri::command]
pub async fn voice_setup_whisper(app: tauri::AppHandle) -> Result<VoiceSetupResult, String> {
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("no prebuilt for this platform — set binary path manually".to_string());
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("cannot resolve the app data directory: {error}"))?
        .join("whisper");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create {}: {error}", dir.display()))?;

    // Stage 1 — the binary (zip → extract whisper-cli.exe + its DLLs).
    let binary = dir.join("whisper-cli.exe");
    if !file_present(&binary) {
        let zip_path = download_to_file(
            &app,
            WHISPER_CLI_ZIP_URL,
            &dir,
            &format!("whisper-bin-x64-{WHISPER_CLI_VERSION}.zip"),
            "whisper-cli",
            Some("binary"),
        )
        .await?;
        let extract_dir = dir.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            extract_whisper_zip(&zip_path, &extract_dir)
        })
        .await
        .map_err(|error| format!("zip extraction task failed: {error}"))?;
        result?;
        if !file_present(&binary) {
            return Err(format!(
                "archive did not contain whisper-cli.exe ({WHISPER_CLI_VERSION})"
            ));
        }
    }

    // Stage 2 — the model, through the same streamed-download machinery.
    let model = dir.join(format!("ggml-{SETUP_MODEL_ID}.bin"));
    if !file_present(&model) {
        download_model_into(&app, SETUP_MODEL_ID, &dir, Some("model")).await?;
    }

    Ok(VoiceSetupResult {
        binary_path: binary.to_string_lossy().into_owned(),
        model_path: model.to_string_lossy().into_owned(),
    })
}

/// whisper-cli argument list for one transcription run. Factored out so the
/// hotword (`--prompt`) wiring is unit-testable: blank/empty prompts add no
/// flag, non-empty prompts ride as a single argv entry (no shell involved).
fn transcribe_args(model: &Path, wav: &Path, prompt: Option<&str>) -> Vec<std::ffi::OsString> {
    let mut args: Vec<std::ffi::OsString> = vec![
        "-m".into(),
        model.into(),
        "-f".into(),
        wav.into(),
        // Plain text on stdout: no timestamps, no banner/progress prints.
        "--no-timestamps".into(),
        "--no-prints".into(),
    ];
    if let Some(prompt) = prompt.map(str::trim).filter(|prompt| !prompt.is_empty()) {
        args.push("--prompt".into());
        args.push(prompt.into());
    }
    args
}

fn file_present(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.len() > 0)
        .unwrap_or(false)
}

/// Shared model-download core: validates the id and streams
/// `{MODEL_URL_BASE}/ggml-<id>.bin` into `dest_dir`.
async fn download_model_into(
    app: &tauri::AppHandle,
    model_id: &str,
    dest_dir: &Path,
    stage: Option<&'static str>,
) -> Result<PathBuf, String> {
    validate_model_id(model_id)?;
    fs::create_dir_all(dest_dir)
        .map_err(|error| format!("failed to create {}: {error}", dest_dir.display()))?;
    let file_name = format!("ggml-{model_id}.bin");
    let url = format!("{MODEL_URL_BASE}/{file_name}");
    download_to_file(app, &url, dest_dir, &file_name, model_id, stage).await
}

/// Streamed download with `.part` staging, progress + terminal done/error
/// events on `voice://download`. Returns the final file path.
async fn download_to_file(
    app: &tauri::AppHandle,
    url: &str,
    dest_dir: &Path,
    file_name: &str,
    event_id: &str,
    stage: Option<&'static str>,
) -> Result<PathBuf, String> {
    let target = dest_dir.join(file_name);
    let temp = dest_dir.join(format!("{file_name}.part"));

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("download failed: {error}"))?;

    let total = response.content_length();
    let mut file = fs::File::create(&temp)
        .map_err(|error| format!("failed to create {}: {error}", temp.display()))?;
    let mut received: u64 = 0;
    let mut last_reported: u64 = 0;
    emit_progress(app, event_id, 0, total, stage);

    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                let _ = fs::remove_file(&temp);
                let message = format!("download interrupted: {error}");
                emit_error(app, event_id, received, total, stage, &message);
                return Err(message);
            }
        };
        if let Err(error) = file.write_all(&chunk) {
            let _ = fs::remove_file(&temp);
            let message = format!("failed to write {}: {error}", temp.display());
            emit_error(app, event_id, received, total, stage, &message);
            return Err(message);
        }
        received += chunk.len() as u64;
        if received - last_reported >= PROGRESS_STRIDE {
            last_reported = received;
            emit_progress(app, event_id, received, total, stage);
        }
    }
    drop(file);

    replace_file(&temp, &target)?;
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DownloadProgress {
            model_id: event_id.to_string(),
            received,
            total,
            stage,
            done: Some(true),
            path: Some(target.to_string_lossy().into_owned()),
            error: None,
        },
    );
    Ok(target)
}

/// Extract whisper-cli.exe and every DLL from the release zip, flattening any
/// archive-internal directories into `dest`. Entry names are sanitized via
/// `enclosed_name` and only the basename is used — a hostile archive cannot
/// escape the managed directory.
fn extract_whisper_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path)
        .map_err(|error| format!("failed to open {}: {error}", zip_path.display()))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("invalid whisper archive: {error}"))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to read archive entry: {error}"))?;
        if entry.is_dir() {
            continue;
        }
        let Some(name) = entry
            .enclosed_name()
            .and_then(|path| path.file_name().map(|name| name.to_os_string()))
        else {
            continue;
        };
        let lower = name.to_string_lossy().to_ascii_lowercase();
        if lower != "whisper-cli.exe" && !lower.ends_with(".dll") {
            continue;
        }
        let out_path = dest.join(&name);
        let mut out = fs::File::create(&out_path)
            .map_err(|error| format!("failed to create {}: {error}", out_path.display()))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|error| format!("failed to extract {}: {error}", out_path.display()))?;
    }

    let _ = fs::remove_file(zip_path);
    Ok(())
}

fn emit_progress(
    app: &tauri::AppHandle,
    model_id: &str,
    received: u64,
    total: Option<u64>,
    stage: Option<&'static str>,
) {
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DownloadProgress {
            model_id: model_id.to_string(),
            received,
            total,
            stage,
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
    stage: Option<&'static str>,
    message: &str,
) {
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DownloadProgress {
            model_id: model_id.to_string(),
            received,
            total,
            stage,
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
    use super::{parse_transcript, transcribe_args, validate_model_id};
    use std::path::Path;

    #[test]
    fn builds_transcribe_args_with_and_without_prompt() {
        let model = Path::new("m.bin");
        let wav = Path::new("a.wav");
        let base: Vec<String> = ["-m", "m.bin", "-f", "a.wav", "--no-timestamps", "--no-prints"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let render = |prompt: Option<&str>| -> Vec<String> {
            transcribe_args(model, wav, prompt)
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect()
        };

        assert_eq!(render(None), base);
        // Blank prompts must not emit a dangling --prompt flag.
        assert_eq!(render(Some("   ")), base);

        let mut with_prompt = base.clone();
        with_prompt.push("--prompt".to_string());
        with_prompt.push("Tauri, Zustand, xterm.js".to_string());
        assert_eq!(render(Some(" Tauri, Zustand, xterm.js ")), with_prompt);
    }

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
