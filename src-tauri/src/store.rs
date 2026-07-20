use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use uuid::Uuid;

use crate::fs::expand_home;

/// Name of the per-project helm data directory (created lazily on first write).
const STORE_DIR: &str = ".helm";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreEntry {
    pub name: String,
    pub dir: bool,
    pub size: u64,
    /// Milliseconds since the Unix epoch; None when the platform withholds mtime.
    pub modified_ms: Option<u64>,
}

/// `async` so Tauri v2 runs the disk read off the UI thread. The body holds no `.await`.
#[tauri::command]
pub async fn helm_store_read(project_root: String, rel_path: String) -> Result<String, String> {
    let path = resolve_store_path(&project_root, &rel_path)?;
    fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))
}

/// Atomic write: the content lands in a temp file in the target directory and is
/// renamed over the destination, so readers never observe a half-written file.
#[tauri::command]
pub async fn helm_store_write(
    project_root: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    write_store_bytes(&project_root, &rel_path, content.as_bytes())
}

/// Binary sibling of `helm_store_write` — same traversal guards and atomic
/// rename, content arrives base64-encoded (voice WAV upload path).
#[tauri::command]
pub async fn helm_store_write_b64(
    project_root: String,
    rel_path: String,
    b64: String,
) -> Result<(), String> {
    let bytes = B64
        .decode(b64.as_bytes())
        .map_err(|error| format!("invalid base64 content: {error}"))?;
    write_store_bytes(&project_root, &rel_path, &bytes)
}

fn write_store_bytes(project_root: &str, rel_path: &str, bytes: &[u8]) -> Result<(), String> {
    let target = resolve_store_path(project_root, rel_path)?;
    let parent = target
        .parent()
        .ok_or_else(|| format!("no parent directory for {}", target.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;

    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| format!("no file name in {}", target.display()))?;
    let temp = parent.join(format!(".{file_name}.tmp-{}", Uuid::new_v4()));
    fs::write(&temp, bytes)
        .map_err(|error| format!("failed to write {}: {error}", temp.display()))?;
    replace_file(&temp, &target)
}

/// Lists a `.helm/` subdirectory. A missing directory is an empty listing, not
/// an error — the store is created lazily and callers probe before first write.
#[tauri::command]
pub async fn helm_store_list(
    project_root: String,
    rel_dir: String,
) -> Result<Vec<StoreEntry>, String> {
    let dir = resolve_store_dir(&project_root, &rel_dir)?;
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let read_dir = fs::read_dir(&dir)
        .map_err(|error| format!("failed to read {}: {error}", dir.display()))?;
    let mut entries = Vec::new();
    for entry in read_dir.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64);
        entries.push(StoreEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            dir: metadata.is_dir(),
            size: metadata.len(),
            modified_ms,
        });
    }

    entries.sort_by(|left, right| {
        right
            .dir
            .cmp(&left.dir)
            .then_with(|| compare_names(&left.name, &right.name))
    });
    Ok(entries)
}

fn resolve_store_path(project_root: &str, rel_path: &str) -> Result<PathBuf, String> {
    let root = store_root(project_root)?;
    let rel = sanitize_rel_path(rel_path)?;
    Ok(root.join(rel))
}

/// Like `resolve_store_path`, but an empty / "." rel_dir addresses `.helm/` itself.
fn resolve_store_dir(project_root: &str, rel_dir: &str) -> Result<PathBuf, String> {
    let root = store_root(project_root)?;
    let trimmed = rel_dir.trim();
    if trimmed.is_empty() || trimmed == "." {
        return Ok(root);
    }
    Ok(root.join(sanitize_rel_path(rel_dir)?))
}

fn store_root(project_root: &str) -> Result<PathBuf, String> {
    let root = expand_home(project_root);
    if !root.is_dir() {
        return Err(format!("project root is not a directory: {}", root.display()));
    }
    Ok(root.join(STORE_DIR))
}

/// Confines a caller-supplied relative path inside `.helm/`. Rejects absolute
/// paths, drive prefixes, `..` traversal, and NUL bytes; `\` is treated as a
/// separator so Windows-style input cannot smuggle components on Unix.
fn sanitize_rel_path(rel_path: &str) -> Result<PathBuf, String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        return Err("rel_path cannot be empty".to_string());
    }
    if trimmed.contains('\0') {
        return Err("rel_path contains a NUL byte".to_string());
    }

    let normalized = trimmed.replace('\\', "/");
    if normalized.starts_with('/') || Path::new(&normalized).is_absolute() {
        return Err(format!("rel_path must be relative: {rel_path}"));
    }

    let mut clean = PathBuf::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => {
                let part_str = part.to_string_lossy();
                if part_str == ".." || part_str.contains(':') {
                    return Err(format!("rel_path escapes the store: {rel_path}"));
                }
                clean.push(part);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("rel_path escapes the store: {rel_path}"));
            }
        }
    }

    if clean.as_os_str().is_empty() {
        return Err("rel_path cannot be empty".to_string());
    }
    Ok(clean)
}

/// Rename with a Windows fallback: std::fs::rename fails there when the
/// destination exists, so retry after removing it. The temp file is cleaned up
/// on failure so aborted writes leave no litter.
fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    if fs::rename(temp, target).is_ok() {
        return Ok(());
    }
    let _ = fs::remove_file(target);
    fs::rename(temp, target).map_err(|error| {
        let _ = fs::remove_file(temp);
        format!("failed to replace {}: {error}", target.display())
    })
}

fn compare_names(left: &str, right: &str) -> Ordering {
    left.to_lowercase()
        .cmp(&right.to_lowercase())
        .then_with(|| left.cmp(right))
}

#[cfg(test)]
mod tests {
    use super::sanitize_rel_path;
    use std::path::PathBuf;

    #[test]
    fn accepts_nested_relative_paths() {
        assert_eq!(
            sanitize_rel_path("memory/INDEX.md").unwrap(),
            PathBuf::from("memory/INDEX.md")
        );
        assert_eq!(
            sanitize_rel_path("missions/abc/mailbox/note.md").unwrap(),
            PathBuf::from("missions/abc/mailbox/note.md")
        );
        assert_eq!(
            sanitize_rel_path("./board.json").unwrap(),
            PathBuf::from("board.json")
        );
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        assert!(sanitize_rel_path("../secrets").is_err());
        assert!(sanitize_rel_path("memory/../../evil").is_err());
        assert!(sanitize_rel_path("/etc/passwd").is_err());
        assert!(sanitize_rel_path("..\\evil").is_err());
        assert!(sanitize_rel_path("C:\\evil").is_err());
        assert!(sanitize_rel_path("C:evil").is_err());
        assert!(sanitize_rel_path("").is_err());
        assert!(sanitize_rel_path(".").is_err());
        assert!(sanitize_rel_path("a\0b").is_err());
    }
}
