use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::fs::expand_home;

/// Flight recorder cap per session file; on overflow the live file rotates to
/// `<sessionId>.1.ndjson` (previous rotation is discarded) and starts fresh.
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
/// In-memory buffer per session before a disk flush. Terminal output arrives in
/// small bursts; buffering avoids one open/write/close per PTY chunk.
const FLUSH_THRESHOLD: usize = 64 * 1024;
/// A single event line larger than this is rejected rather than buffered.
const MAX_LINE_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub struct RecorderState {
    /// session file path -> pending ndjson bytes.
    buffers: Mutex<HashMap<PathBuf, Vec<u8>>>,
}

/// Buffered append of one ndjson event line. The line is held in memory until
/// the session buffer crosses FLUSH_THRESHOLD, then flushed in one write.
#[tauri::command]
pub async fn recorder_append(
    state: tauri::State<'_, RecorderState>,
    project_root: String,
    session_id: String,
    ndjson_line: String,
) -> Result<(), String> {
    let line = ndjson_line.trim_end_matches(['\r', '\n']);
    if line.is_empty() {
        return Ok(());
    }
    if line.len() > MAX_LINE_BYTES {
        return Err(format!(
            "recorder line too large: {} bytes (limit {MAX_LINE_BYTES})",
            line.len()
        ));
    }
    let path = recording_path(&project_root, &session_id)?;

    let flush: Option<Vec<u8>> = {
        let mut buffers = state
            .buffers
            .lock()
            .map_err(|_| "recorder state is poisoned".to_string())?;
        let buffer = buffers.entry(path.clone()).or_default();
        buffer.extend_from_slice(line.as_bytes());
        buffer.push(b'\n');
        if buffer.len() >= FLUSH_THRESHOLD {
            Some(std::mem::take(buffer))
        } else {
            None
        }
    };

    if let Some(bytes) = flush {
        flush_to_disk(&path, &bytes)?;
    }
    Ok(())
}

/// Returns the recorded lines starting at `from_line` (0-based) for the CURRENT
/// (unrotated) file. Pending buffered lines are flushed first so readers always
/// see a complete stream.
#[tauri::command]
pub async fn recorder_read(
    state: tauri::State<'_, RecorderState>,
    project_root: String,
    session_id: String,
    from_line: Option<u64>,
) -> Result<Vec<String>, String> {
    let path = recording_path(&project_root, &session_id)?;

    let pending: Option<Vec<u8>> = {
        let mut buffers = state
            .buffers
            .lock()
            .map_err(|_| "recorder state is poisoned".to_string())?;
        buffers
            .get_mut(&path)
            .filter(|buffer| !buffer.is_empty())
            .map(std::mem::take)
    };
    if let Some(bytes) = pending {
        flush_to_disk(&path, &bytes)?;
    }

    if !path.is_file() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let from_line = from_line.unwrap_or(0) as usize;
    Ok(content
        .lines()
        .skip(from_line)
        .map(str::to_string)
        .collect())
}

fn flush_to_disk(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("no parent directory for {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;

    // Rotate BEFORE appending so a session never grows past cap + one flush.
    let current_len = fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0);
    if current_len + bytes.len() as u64 > MAX_FILE_BYTES && current_len > 0 {
        let rotated = rotated_path(path);
        let _ = fs::remove_file(&rotated);
        fs::rename(path, &rotated)
            .map_err(|error| format!("failed to rotate {}: {error}", path.display()))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open {}: {error}", path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("failed to append {}: {error}", path.display()))
}

fn rotated_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "session".to_string());
    path.with_file_name(format!("{stem}.1.ndjson"))
}

fn recording_path(project_root: &str, session_id: &str) -> Result<PathBuf, String> {
    let root = expand_home(project_root);
    if !root.is_dir() {
        return Err(format!(
            "project root is not a directory: {}",
            root.display()
        ));
    }

    let session_id = session_id.trim();
    let valid = !session_id.is_empty()
        && session_id.len() <= 128
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !session_id.starts_with('.');
    if !valid {
        return Err(format!("invalid session id: {session_id}"));
    }

    Ok(root
        .join(".helm")
        .join("recordings")
        .join(format!("{session_id}.ndjson")))
}

#[cfg(test)]
mod tests {
    use super::recording_path;

    #[test]
    fn rejects_traversal_session_ids() {
        let root = std::env::temp_dir();
        let root = root.to_string_lossy();
        assert!(recording_path(&root, "../evil").is_err());
        assert!(recording_path(&root, "a/b").is_err());
        assert!(recording_path(&root, "a\\b").is_err());
        assert!(recording_path(&root, ".hidden").is_err());
        assert!(recording_path(&root, "").is_err());
        assert!(recording_path(&root, "pane-1_2.3").is_ok());
    }
}
