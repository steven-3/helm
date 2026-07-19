use crate::fs::expand_home;
use ignore::overrides::OverrideBuilder;
use ignore::{WalkBuilder, WalkState};
use regex::RegexBuilder;
use serde::Serialize;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Files larger than this are never opened — a project search must not stall
/// on a bundle/artifact that slipped past .gitignore.
const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024;
/// Result cap when the caller does not pass `maxResults`.
const DEFAULT_MAX_RESULTS: u32 = 500;
/// Absolute ceiling on `maxResults` — the IPC payload stays bounded no matter
/// what the renderer asks for.
const RESULT_HARD_CAP: u32 = 10_000;
/// `lineText` is windowed to at most this many chars around the match.
const LINE_TEXT_MAX_CHARS: usize = 300;
/// Chars of left context kept before the match when a long line is windowed.
const MATCH_CONTEXT_CHARS: usize = 80;
/// A NUL byte in this head marks the file as binary and skips it.
const BINARY_SNIFF_BYTES: usize = 8 * 1024;

/// One matched occurrence. `line` and `column` are 1-based; `column`,
/// `matchStart`, and `matchEnd` are UTF-16 code units so the renderer can
/// slice `lineText` directly with `String.prototype.slice`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    /// Path relative to the search root.
    pub path: String,
    pub line: u64,
    pub column: u32,
    pub line_text: String,
    pub match_start: u32,
    pub match_end: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub results: Vec<SearchHit>,
    pub truncated: bool,
}

/// `async` so Tauri v2 runs it off the UI thread — this walks the tree with
/// the ripgrep walker (parallel, .gitignore-aware, hidden files skipped) and
/// scans file contents. The body holds no `.await`.
///
/// Non-regex queries are matched literally via `regex::escape`, so both modes
/// share one matcher and byte-accurate offsets. An empty query returns no
/// results rather than matching everything.
#[tauri::command]
pub async fn search_project(
    root: String,
    query: String,
    case_sensitive: bool,
    regex: bool,
    include_glob: Option<String>,
    max_results: Option<u32>,
) -> Result<SearchResults, String> {
    let root = expand_home(&root);
    if !root.is_dir() {
        return Err(format!(
            "search root is not a directory: {}",
            root.display()
        ));
    }
    if query.is_empty() {
        return Ok(SearchResults {
            results: Vec::new(),
            truncated: false,
        });
    }

    let max = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, RESULT_HARD_CAP) as usize;

    let pattern = if regex {
        query.clone()
    } else {
        regex::escape(&query)
    };
    let matcher = RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|error| format!("invalid search pattern: {error}"))?;

    let mut walker = WalkBuilder::new(&root);
    walker.max_filesize(Some(MAX_FILE_SIZE));
    if let Some(glob) = include_glob.as_deref().filter(|glob| !glob.is_empty()) {
        let mut overrides = OverrideBuilder::new(&root);
        overrides
            .add(glob)
            .map_err(|error| format!("invalid include glob: {error}"))?;
        // Whitelist-only overrides: files must match the glob; directories are
        // still descended into.
        walker.overrides(
            overrides
                .build()
                .map_err(|error| format!("invalid include glob: {error}"))?,
        );
    }

    let hits: Mutex<Vec<SearchHit>> = Mutex::new(Vec::new());
    let truncated = AtomicBool::new(false);

    walker.build_parallel().run(|| {
        Box::new(|entry| {
            if truncated.load(Ordering::Relaxed) {
                return WalkState::Quit;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => return WalkState::Continue,
            };
            if !entry.file_type().is_some_and(|file_type| file_type.is_file()) {
                return WalkState::Continue;
            }

            let path = entry.path();
            // Unreadable / vanished files are skipped, not surfaced as errors —
            // a project-wide search must return what it can.
            let bytes = match fs::read(path) {
                Ok(bytes) => bytes,
                Err(_) => return WalkState::Continue,
            };
            if bytes.iter().take(BINARY_SNIFF_BYTES).any(|&byte| byte == 0) {
                return WalkState::Continue;
            }
            let content = String::from_utf8_lossy(&bytes);
            let relative = path
                .strip_prefix(&root)
                .unwrap_or(path)
                .to_string_lossy()
                .into_owned();

            for (index, line) in content.lines().enumerate() {
                // lines() keeps a trailing \r on CRLF files — strip it so `$`
                // anchors match and lineText carries no carriage return.
                let line = line.strip_suffix('\r').unwrap_or(line);
                for found in matcher.find_iter(line) {
                    let hit = build_hit(
                        &relative,
                        index as u64 + 1,
                        line,
                        found.start(),
                        found.end(),
                    );
                    let mut guard = match hits.lock() {
                        Ok(guard) => guard,
                        Err(_) => return WalkState::Quit,
                    };
                    // Check-before-push keeps the cap exact across threads:
                    // `truncated` only trips when a hit actually overflows, so
                    // a walk that ends with exactly `max` hits stays honest.
                    if guard.len() >= max {
                        truncated.store(true, Ordering::Relaxed);
                        return WalkState::Quit;
                    }
                    guard.push(hit);
                }
            }
            WalkState::Continue
        })
    });

    let mut results = hits
        .into_inner()
        .map_err(|_| "search result state is poisoned".to_string())?;
    // The parallel walker completes files in nondeterministic order — sort so
    // repeated searches render identically.
    results.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then(left.line.cmp(&right.line))
            .then(left.column.cmp(&right.column))
    });
    Ok(SearchResults {
        results,
        truncated: truncated.load(Ordering::Relaxed),
    })
}

/// Windows a (possibly huge, e.g. minified) line to ≤300 chars around the
/// match and computes the UTF-16 offsets of the match within that window.
/// `match_start`/`match_end` are byte offsets from the regex engine and are
/// therefore valid char boundaries in `line`.
fn build_hit(
    path: &str,
    line_number: u64,
    line: &str,
    match_start: usize,
    match_end: usize,
) -> SearchHit {
    // Fast path: chars ≤ bytes, so a line within the cap in bytes needs no
    // windowing at all.
    let (window_start, window_end) = if line.len() <= LINE_TEXT_MAX_CHARS {
        (0, line.len())
    } else {
        let start = line[..match_start]
            .char_indices()
            .rev()
            .nth(MATCH_CONTEXT_CHARS - 1)
            .map(|(index, _)| index)
            .unwrap_or(0);
        let end = line[start..]
            .char_indices()
            .nth(LINE_TEXT_MAX_CHARS)
            .map(|(index, _)| start + index)
            .unwrap_or(line.len());
        (start, end)
    };

    // A match longer than the window is clamped to the window's end so the
    // offsets always index into the returned text.
    let display_end = match_end.min(window_end).max(match_start);
    let match_start_off = utf16_len(&line[window_start..match_start]);
    let match_end_off = match_start_off + utf16_len(&line[match_start..display_end]);
    let column = utf16_len(&line[..match_start]) + 1;

    SearchHit {
        path: path.to_string(),
        line: line_number,
        column: u32::try_from(column).unwrap_or(u32::MAX),
        line_text: line[window_start..window_end].to_string(),
        match_start: u32::try_from(match_start_off).unwrap_or(u32::MAX),
        match_end: u32::try_from(match_end_off).unwrap_or(u32::MAX),
    }
}

fn utf16_len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}
