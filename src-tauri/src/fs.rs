use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use image::ImageReader;
use serde::Serialize;
use std::cmp::Ordering;
use std::env;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub dir: bool,
}

#[derive(Serialize)]
pub struct FileRead {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b64: Option<String>,
    pub mime: String,
    /// Real total size of the file on disk (bytes), independent of the read cap.
    pub size: u64,
    /// True when the file exceeded the read cap and only the head was returned.
    pub truncated: bool,
}

#[derive(Serialize)]
pub struct ImageRead {
    pub b64: String,
    pub mime: String,
    pub w: u32,
    pub h: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileBase64 {
    pub base64: String,
    pub mime: String,
    pub byte_len: u64,
}

#[tauri::command]
pub fn fs_read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let path = expand_home(&path);
    let read_dir = fs::read_dir(&path)
        .map_err(|error| format!("failed to read directory {}: {error}", path.display()))?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            dir: file_type.is_dir(),
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

/// Cap on bytes read from disk (and crossed over IPC). A single click on a
/// multi-GB file in the tree must never fs::read the whole thing — that freezes
/// the thread and can OOM the webview. We stat for the real size, read at most
/// this head, and report `truncated` so the UI stays honest.
const READ_CAP: u64 = 256 * 1024;

/// `async` so Tauri v2 runs it off the UI thread — this stats + reads a file
/// head and base64-encodes binaries. The body holds no `.await`.
#[tauri::command]
pub async fn fs_read_file(path: String) -> Result<FileRead, String> {
    let path = expand_home(&path);
    let mime = mime_for_path(&path).to_string();

    let size = fs::metadata(&path)
        .map_err(|error| format!("failed to stat file {}: {error}", path.display()))?
        .len();
    let truncated = size > READ_CAP;

    let file = fs::File::open(&path)
        .map_err(|error| format!("failed to read file {}: {error}", path.display()))?;
    let mut bytes = Vec::new();
    file.take(READ_CAP)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read file {}: {error}", path.display()))?;

    match String::from_utf8(bytes) {
        Ok(text) => Ok(FileRead {
            text: Some(text),
            b64: None,
            mime,
            size,
            truncated,
        }),
        // A capped head can slice a multi-byte char at the boundary. When the
        // only fault is an incomplete trailing sequence (error_len == None) on a
        // truncated read, keep the valid prefix as text rather than mislabeling
        // a real text file as binary. Otherwise it is genuinely non-UTF-8.
        Err(error)
            if truncated && error.utf8_error().error_len().is_none() =>
        {
            let valid = error.utf8_error().valid_up_to();
            let mut bytes = error.into_bytes();
            bytes.truncate(valid);
            let text = String::from_utf8(bytes).unwrap_or_default();
            Ok(FileRead {
                text: Some(text),
                b64: None,
                mime,
                size,
                truncated,
            })
        }
        Err(error) => Ok(FileRead {
            text: None,
            b64: Some(B64.encode(error.into_bytes())),
            mime,
            size,
            truncated,
        }),
    }
}

/// `async` so Tauri v2 runs the disk write off the UI thread. Editor Ctrl+S
/// path: absolute (or ~-relative) path, UTF-8 content, parent must exist —
/// the editor only saves files it already opened.
#[tauri::command]
pub async fn fs_write_file(path: String, content: String) -> Result<(), String> {
    let path = expand_home(&path);
    fs::write(&path, content)
        .map_err(|error| format!("failed to write file {}: {error}", path.display()))
}

/// Modification time in epoch milliseconds. drvfs has no inotify, so the
/// editor polls this to detect external changes.
#[tauri::command]
pub async fn fs_file_mtime(path: String) -> Result<u64, String> {
    let path = expand_home(&path);
    let modified = fs::metadata(&path)
        .map_err(|error| format!("failed to stat file {}: {error}", path.display()))?
        .modified()
        .map_err(|error| format!("failed to read mtime {}: {error}", path.display()))?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("mtime before epoch {}: {error}", path.display()))
}

/// `async` so Tauri v2 runs it off the UI thread — this reads + base64-encodes a
/// whole image. The body holds no `.await`.
#[tauri::command]
pub async fn image_read(path: String) -> Result<ImageRead, String> {
    let path = expand_home(&path);
    let bytes = fs::read(&path)
        .map_err(|error| format!("failed to read image {}: {error}", path.display()))?;

    // SVG is XML text with no magic bytes, so image::guess_format cannot detect
    // it — special-case by extension. ImagePreview renders an <img> from
    // b64+mime and ignores w/h, so we skip decoding dimensions entirely.
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("svg"))
    {
        return Ok(ImageRead {
            b64: B64.encode(&bytes),
            mime: "image/svg+xml".into(),
            w: 0,
            h: 0,
        });
    }

    let format = image::guess_format(&bytes)
        .map_err(|error| format!("failed to detect image format {}: {error}", path.display()))?;
    let (w, h) = ImageReader::with_format(Cursor::new(bytes.as_slice()), format)
        .into_dimensions()
        .map_err(|error| format!("failed to read image dimensions {}: {error}", path.display()))?;

    Ok(ImageRead {
        b64: B64.encode(&bytes),
        mime: format.to_mime_type().to_string(),
        w,
        h,
    })
}

/// Default byte cap for `read_file_base64` — 10 MB before base64 expansion.
const BASE64_READ_CAP: u64 = 10 * 1024 * 1024;

/// `async` so Tauri v2 runs it off the UI thread — this reads + base64-encodes
/// a whole file (renderer image preview). The body holds no `.await`. Unlike
/// `fs_read_file`, an over-cap file is an ERROR, not a truncated read — a
/// partial image is useless to an <img> tag.
#[tauri::command]
pub async fn read_file_base64(path: String, max_bytes: Option<u64>) -> Result<FileBase64, String> {
    let path = expand_home(&path);
    let cap = max_bytes.unwrap_or(BASE64_READ_CAP);

    // Stat first so a multi-GB file is rejected without reading a byte.
    let byte_len = fs::metadata(&path)
        .map_err(|error| format!("failed to stat file {}: {error}", path.display()))?
        .len();
    if byte_len > cap {
        return Err(format!(
            "file too large: {} is {byte_len} bytes (limit {cap})",
            path.display()
        ));
    }

    let bytes = fs::read(&path)
        .map_err(|error| format!("failed to read file {}: {error}", path.display()))?;

    Ok(FileBase64 {
        base64: B64.encode(&bytes),
        mime: image_mime_for_path(&path).to_string(),
        byte_len,
    })
}

/// Image-preview MIME map (extension-based; SVG has no magic bytes so
/// sniffing is not an option). Narrower than `mime_for_path` on purpose:
/// only types an <img> tag can render, octet-stream otherwise.
fn image_mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    }
}

fn compare_names(left: &str, right: &str) -> Ordering {
    left.to_lowercase()
        .cmp(&right.to_lowercase())
        .then_with(|| left.cmp(right))
}

pub(crate) fn expand_home(path: &str) -> PathBuf {
    let remainder = if path == "~" {
        Some("")
    } else {
        path.strip_prefix("~/")
            .or_else(|| path.strip_prefix("~\\"))
    };

    match (remainder, home_dir()) {
        (Some(""), Some(home)) => home,
        (Some(remainder), Some(home)) => home.join(remainder),
        _ => PathBuf::from(path),
    }
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .filter(|path| !path.is_empty())
        .or_else(|| env::var_os("USERPROFILE").filter(|path| !path.is_empty()))
        .map(PathBuf::from)
}

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("txt" | "log") => "text/plain",
        Some("md" | "markdown") => "text/markdown",
        Some("html" | "htm") => "text/html",
        Some("css") => "text/css",
        Some("csv") => "text/csv",
        Some("xml") => "application/xml",
        Some("json" | "map") => "application/json",
        Some("toml") => "application/toml",
        Some("yaml" | "yml") => "application/yaml",
        Some("js" | "mjs" | "cjs") => "text/javascript",
        Some("ts" | "tsx") => "text/typescript",
        Some("jsx") => "text/jsx",
        Some("rs") => "text/x-rust",
        Some("sh" | "bash" | "zsh" | "fish") => "text/x-shellscript",
        Some("ps1") => "text/x-powershell",
        Some("cmd" | "bat") => "text/x-msdos-batch",
        Some("py") => "text/x-python",
        Some("go") => "text/x-go",
        Some("java") => "text/x-java-source",
        Some("c" | "h") => "text/x-c",
        Some("cc" | "cpp" | "cxx" | "hpp") => "text/x-c++",
        Some("sql") => "application/sql",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg" | "jpe") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("tif" | "tiff") => "image/tiff",
        Some("avif") => "image/avif",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        Some("gz") => "application/gzip",
        Some("wasm") => "application/wasm",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        _ => "application/octet-stream",
    }
}
