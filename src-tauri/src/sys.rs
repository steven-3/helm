use serde::Serialize;
use std::env;
use std::path::Path;
use std::process::Command;

/// Apply the narrow WebKitGTK compatibility guard required by WSLg before
/// Tauri initializes WebKit. Do not override an explicit user choice and do
/// not force software rendering or disable accelerated compositing globally.
pub(crate) fn configure_webkit_environment() {
    #[cfg(target_os = "linux")]
    {
        if is_wsl() && env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

#[cfg(target_os = "linux")]
fn is_wsl() -> bool {
    env::var_os("WSL_DISTRO_NAME").is_some()
        || env::var_os("WSL_INTEROP").is_some()
        || std::fs::read_to_string("/proc/sys/kernel/osrelease")
            .map(|release| release.to_ascii_lowercase().contains("microsoft"))
            .unwrap_or(false)
}

/// Real environment facts the frontend must never guess: the user's home
/// directory (default pane cwd), login shell (default pane command), and the
/// WSL distro name when running under WSL. Every field is None when the
/// underlying source is absent — the UI omits the segment instead of faking it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvInfo {
    pub home: Option<String>,
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub wsl_distro: Option<String>,
}

#[tauri::command]
pub fn env_info() -> EnvInfo {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty());
    let cwd = env::current_dir()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());

    #[cfg(not(windows))]
    let shell = env::var("SHELL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    #[cfg(windows)]
    let shell = None;

    let wsl_distro = env::var("WSL_DISTRO_NAME")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    EnvInfo {
        home,
        shell,
        cwd,
        wsl_distro,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// Two-character porcelain status code, e.g. " M", "??", "A ".
    pub code: String,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    /// Commits ahead/behind upstream; None when no upstream is configured.
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub changes: Vec<GitChange>,
}

/// Returns None when `path` is not inside a git work tree (or git is absent) —
/// the frontend drops the git segments entirely rather than inventing them.
/// `async` so Tauri v2 runs it on a worker thread: useGit polls this every 15s
/// and it shells out to git — keep it off the UI event
/// loop (PTY keystrokes, rendering) which would otherwise hitch, worse on drvfs.
/// The body holds no `.await`, so nothing non-Send crosses a suspend point.
#[tauri::command]
pub async fn git_status(path: String) -> Result<Option<GitStatus>, String> {
    let path = expand_home(&path);
    if !Path::new(&path).is_dir() {
        return Ok(None);
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(&path)
        .args([
            "status",
            "--porcelain=v1",
            "--branch",
            "--ahead-behind",
        ])
        // Porcelain is stable, but the initial-commit branch header is still
        // human text in v1. Pinning the locale keeps that small part parseable.
        .env("LC_ALL", "C")
        .output();

    let output = match output {
        Ok(output) if output.status.success() => output,
        _ => return Ok(None),
    };

    Ok(Some(parse_git_status(&String::from_utf8_lossy(
        &output.stdout,
    ))))
}

fn parse_git_status(output: &str) -> GitStatus {
    let mut branch = None;
    let mut ahead = None;
    let mut behind = None;
    let mut changes = Vec::new();

    for line in output.lines() {
        if let Some(header) = line.strip_prefix("## ") {
            (branch, ahead, behind) = parse_branch_header(header);
            continue;
        }

        let bytes = line.as_bytes();
        if bytes.len() < 3 || bytes[2] != b' ' {
            continue;
        }
        let Some(code) = line.get(..2) else {
            continue;
        };
        let Some(path) = line.get(3..) else {
            continue;
        };
        if path.is_empty() {
            continue;
        }
        changes.push(GitChange {
            code: code.to_string(),
            path: path.to_string(),
        });
    }

    GitStatus {
        branch,
        ahead,
        behind,
        changes,
    }
}

fn parse_branch_header(header: &str) -> (Option<String>, Option<u32>, Option<u32>) {
    let (relation, divergence) = match header.rsplit_once(" [") {
        Some((relation, divergence)) if divergence.ends_with(']') => {
            (relation, Some(&divergence[..divergence.len() - 1]))
        }
        _ => (header, None),
    };

    let (head, has_upstream) = match relation.split_once("...") {
        Some((head, _upstream)) => (head, true),
        None => (relation, false),
    };
    let head = head
        .strip_prefix("No commits yet on ")
        .or_else(|| head.strip_prefix("Initial commit on "))
        .unwrap_or(head);
    let branch = if head.starts_with("HEAD (") {
        Some("HEAD".to_string())
    } else if head.is_empty() {
        None
    } else {
        Some(head.to_string())
    };

    // An upstream with no bracketed divergence is exactly 0/0. Without an
    // upstream, None preserves the frontend's "not configured" distinction.
    let mut ahead = has_upstream.then_some(0);
    let mut behind = has_upstream.then_some(0);
    if let Some(divergence) = divergence {
        for item in divergence.split(',').map(str::trim) {
            if let Some(value) = item
                .strip_prefix("ahead ")
                .and_then(|value| value.parse().ok())
            {
                ahead = Some(value);
            } else if let Some(value) = item
                .strip_prefix("behind ")
                .and_then(|value| value.parse().ok())
            {
                behind = Some(value);
            } else if item == "gone" || item == "different" {
                // The configured upstream cannot provide a meaningful count.
                ahead = None;
                behind = None;
            }
        }
    }

    (branch, ahead, behind)
}

fn expand_home(path: &str) -> String {
    let home = || {
        env::var("HOME")
            .ok()
            .or_else(|| env::var("USERPROFILE").ok())
            .filter(|value| !value.is_empty())
    };
    if path == "~" {
        return home().unwrap_or_else(|| path.to_string());
    }
    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = home() {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::parse_git_status;

    #[test]
    fn parses_tracking_branch_divergence_and_changes() {
        let status = parse_git_status(
            "## feature/runtime...origin/feature/runtime [ahead 2, behind 3]\n M src/lib.rs\n?? file with spaces.txt\n",
        );

        assert_eq!(status.branch.as_deref(), Some("feature/runtime"));
        assert_eq!(status.ahead, Some(2));
        assert_eq!(status.behind, Some(3));
        assert_eq!(status.changes.len(), 2);
        assert_eq!(status.changes[0].code, " M");
        assert_eq!(status.changes[0].path, "src/lib.rs");
        assert_eq!(status.changes[1].code, "??");
        assert_eq!(status.changes[1].path, "file with spaces.txt");
    }

    #[test]
    fn parses_clean_tracking_and_unborn_or_detached_heads() {
        let clean = parse_git_status("## main...origin/main\n");
        assert_eq!(clean.branch.as_deref(), Some("main"));
        assert_eq!(clean.ahead, Some(0));
        assert_eq!(clean.behind, Some(0));

        let unborn = parse_git_status("## No commits yet on trunk\n");
        assert_eq!(unborn.branch.as_deref(), Some("trunk"));
        assert_eq!(unborn.ahead, None);
        assert_eq!(unborn.behind, None);

        let detached = parse_git_status("## HEAD (no branch)\n");
        assert_eq!(detached.branch.as_deref(), Some("HEAD"));

        let gone = parse_git_status("## main...origin/main [gone]\n");
        assert_eq!(gone.ahead, None);
        assert_eq!(gone.behind, None);
    }
}
