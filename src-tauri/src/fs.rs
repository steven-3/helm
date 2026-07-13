use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use image::ImageReader;
use serde::Serialize;
use std::cmp::Ordering;
use std::env;
use std::fs;
use std::io::Cursor;
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
}

#[derive(Serialize)]
pub struct ImageRead {
    pub b64: String,
    pub mime: String,
    pub w: u32,
    pub h: u32,
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

#[tauri::command]
pub fn fs_read_file(path: String) -> Result<FileRead, String> {
    let path = expand_home(&path);
    let mime = mime_for_path(&path).to_string();
    let bytes = fs::read(&path)
        .map_err(|error| format!("failed to read file {}: {error}", path.display()))?;

    match String::from_utf8(bytes) {
        Ok(text) => Ok(FileRead {
            text: Some(text),
            b64: None,
            mime,
        }),
        Err(error) => Ok(FileRead {
            text: None,
            b64: Some(B64.encode(error.into_bytes())),
            mime,
        }),
    }
}

#[tauri::command]
pub fn image_read(path: String) -> Result<ImageRead, String> {
    let path = expand_home(&path);
    let bytes = fs::read(&path)
        .map_err(|error| format!("failed to read image {}: {error}", path.display()))?;
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

fn compare_names(left: &str, right: &str) -> Ordering {
    left.to_lowercase()
        .cmp(&right.to_lowercase())
        .then_with(|| left.cmp(right))
}

fn expand_home(path: &str) -> PathBuf {
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
