use serde::Serialize;
use std::env;
use std::path::Path;
use std::process::{Command, Output};

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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitEntry {
    pub path: String,
    /// Index status from porcelain v2 ("." means unchanged).
    pub x: String,
    /// Worktree status from porcelain v2 ("." means unchanged).
    pub y: String,
    pub renamed_from: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    /// Commits ahead/behind upstream; None when no usable upstream is configured.
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub staged: Vec<GitEntry>,
    pub unstaged: Vec<GitEntry>,
    pub untracked: Vec<GitEntry>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchList {
    pub branches: Vec<String>,
    pub current: Option<String>,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
}

/// Returns None when `path` is not inside a git work tree (or git is absent) —
/// the frontend drops the git segments entirely rather than inventing them.
/// `async` keeps the shell-out off Tauri's UI event loop; useGit polls every 15s.
#[tauri::command]
pub async fn git_status(path: String) -> Result<Option<GitStatus>, String> {
    match read_git_status(&path) {
        Ok(status) => Ok(Some(status)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn git_stage(repo_path: String, path: String) -> Result<(), String> {
    let toplevel = repository_toplevel(&repo_path)?;
    run_git(&toplevel, &["add", "--", path.as_str()]).map(|_| ())
}

#[tauri::command]
pub async fn git_unstage(repo_path: String, path: String) -> Result<(), String> {
    let toplevel = repository_toplevel(&repo_path)?;
    if repository_has_head(&toplevel)? {
        run_git(
            &toplevel,
            &["restore", "--staged", "--", path.as_str()],
        )?;
    } else {
        run_git(
            &toplevel,
            &[
                "rm",
                "--cached",
                "--force",
                "--ignore-unmatch",
                "--",
                path.as_str(),
            ],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["add", "--all"]).map(|_| ())
}

#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), String> {
    if repository_has_head(&repo_path)? {
        run_git(&repo_path, &["restore", "--staged", "--", ":/"])?;
    } else {
        run_git(
            &repo_path,
            &[
                "rm",
                "--cached",
                "-r",
                "--force",
                "--ignore-unmatch",
                "--",
                ":/",
            ],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_commit(
    repo_path: String,
    message: String,
    amend: Option<bool>,
) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }

    let mut command = git_command(&repo_path)?;
    command.arg("commit");
    if amend.unwrap_or(false) {
        command.arg("--amend");
    }
    command.arg("--message").arg(message);
    execute_git(command).map(|_| ())
}

#[tauri::command]
pub async fn git_diff(
    repo_path: String,
    path: String,
    staged: Option<bool>,
) -> Result<String, String> {
    let toplevel = repository_toplevel(&repo_path)?;
    let staged = staged.unwrap_or(false);
    let mut command = git_command(&toplevel)?;
    command.arg("diff");
    if staged {
        command.arg("--cached");
    }
    command.arg("--").arg(&path);
    let output = execute_git(command)?;

    if staged || !output.stdout.is_empty() || path_is_tracked(&toplevel, &path)? {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }

    // Plain `git diff` omits untracked files. Diffing against the platform null
    // device gives the SCM view a normal unified diff for those files too. Use
    // an absolute path because --no-index compares filesystem paths.
    #[cfg(windows)]
    const NULL_DEVICE: &str = "NUL";
    #[cfg(not(windows))]
    const NULL_DEVICE: &str = "/dev/null";

    let absolute_path = Path::new(&toplevel).join(&path);
    let mut command = git_command(&toplevel)?;
    command
        .args(["diff", "--no-index", "--", NULL_DEVICE])
        .arg(absolute_path);
    let output = execute_git_allow_diff(command)?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command]
pub async fn git_branch_list(repo_path: String) -> Result<GitBranchList, String> {
    let output = run_git(
        &repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )?;
    let branches = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(str::to_string)
        .collect();
    let status = read_git_status(&repo_path)?;

    Ok(GitBranchList {
        branches,
        current: status.branch,
        upstream: status.upstream,
        ahead: status.ahead,
        behind: status.behind,
    })
}

#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    validate_branch_name(&repo_path, &branch)?;
    run_git(&repo_path, &["switch", "--", branch.as_str()]).map(|_| ())
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, name: String) -> Result<(), String> {
    validate_branch_name(&repo_path, &name)?;
    run_git(&repo_path, &["switch", "--create", name.as_str()]).map(|_| ())
}

#[tauri::command]
pub async fn git_discard(repo_path: String, path: String) -> Result<(), String> {
    let toplevel = repository_toplevel(&repo_path)?;
    run_git(
        &toplevel,
        &["restore", "--worktree", "--", path.as_str()],
    )
    .map(|_| ())
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["push"]).map(|_| ())
}

#[tauri::command]
pub async fn git_pull(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["pull"]).map(|_| ())
}

#[tauri::command]
pub async fn git_fetch(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["fetch"]).map(|_| ())
}

fn read_git_status(repo_path: &str) -> Result<GitStatus, String> {
    let output = run_git(
        repo_path,
        &[
            "status",
            "--porcelain=v2",
            "-z",
            "--branch",
            "--ahead-behind",
        ],
    )?;
    Ok(parse_git_status(&String::from_utf8_lossy(&output.stdout)))
}

fn parse_git_status(output: &str) -> GitStatus {
    let mut status = GitStatus {
        branch: None,
        upstream: None,
        ahead: None,
        behind: None,
        staged: Vec::new(),
        unstaged: Vec::new(),
        untracked: Vec::new(),
    };
    let mut records = output.split('\0');

    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }

        if let Some(value) = record.strip_prefix("# branch.head ") {
            status.branch = match value {
                "(detached)" => Some("HEAD".to_string()),
                "(unknown)" => None,
                _ => Some(value.to_string()),
            };
            continue;
        }
        if let Some(value) = record.strip_prefix("# branch.upstream ") {
            status.upstream = Some(value.to_string());
            continue;
        }
        if let Some(value) = record.strip_prefix("# branch.ab ") {
            for count in value.split_whitespace() {
                if let Some(value) = count
                    .strip_prefix('+')
                    .and_then(|value| value.parse().ok())
                {
                    status.ahead = Some(value);
                } else if let Some(value) = count
                    .strip_prefix('-')
                    .and_then(|value| value.parse().ok())
                {
                    status.behind = Some(value);
                }
            }
            continue;
        }

        let entry = if record.starts_with("1 ") {
            parse_tracked_entry(record, 9, None)
        } else if record.starts_with("2 ") {
            let renamed_from = records
                .next()
                .filter(|path| !path.is_empty())
                .map(str::to_string);
            parse_tracked_entry(record, 10, renamed_from)
        } else if record.starts_with("u ") {
            parse_tracked_entry(record, 11, None)
        } else if let Some(path) = record.strip_prefix("? ") {
            if !path.is_empty() {
                status.untracked.push(GitEntry {
                    path: path.to_string(),
                    x: "?".to_string(),
                    y: "?".to_string(),
                    renamed_from: None,
                });
            }
            None
        } else {
            None
        };

        if let Some(entry) = entry {
            if entry.x != "." {
                status.staged.push(entry.clone());
            }
            if entry.y != "." {
                status.unstaged.push(entry);
            }
        }
    }

    status
}

fn parse_tracked_entry(
    record: &str,
    field_count: usize,
    renamed_from: Option<String>,
) -> Option<GitEntry> {
    let fields: Vec<_> = record.splitn(field_count, ' ').collect();
    if fields.len() != field_count {
        return None;
    }

    let mut status = fields[1].chars();
    let x = status.next()?;
    let y = status.next()?;
    if status.next().is_some() || fields[field_count - 1].is_empty() {
        return None;
    }

    Some(GitEntry {
        path: fields[field_count - 1].to_string(),
        x: x.to_string(),
        y: y.to_string(),
        renamed_from,
    })
}

fn git_command(repo_path: &str) -> Result<Command, String> {
    let repo_path = expand_home(repo_path);
    if !Path::new(&repo_path).is_dir() {
        return Err(format!("Not a directory: {repo_path}"));
    }

    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo_path)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0");
    Ok(command)
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<Output, String> {
    let mut command = git_command(repo_path)?;
    command.args(args);
    execute_git(command)
}

fn execute_git(mut command: Command) -> Result<Output, String> {
    let output = command
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(git_failure(&output))
    }
}

fn execute_git_allow_diff(mut command: Command) -> Result<Output, String> {
    let output = command
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;
    if output.status.success() || output.status.code() == Some(1) {
        Ok(output)
    } else {
        Err(git_failure(&output))
    }
}

fn git_failure(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = stderr.trim();
    let detail = if detail.is_empty() {
        stdout.trim()
    } else {
        detail
    };

    if detail.is_empty() {
        match output.status.code() {
            Some(code) => format!("git exited with status {code}"),
            None => "git was terminated by a signal".to_string(),
        }
    } else {
        detail.to_string()
    }
}

fn repository_toplevel(repo_path: &str) -> Result<String, String> {
    let output = run_git(repo_path, &["rev-parse", "--show-toplevel"])?;
    let toplevel = String::from_utf8_lossy(&output.stdout);
    let toplevel = toplevel.trim_end_matches(&['\r', '\n'][..]);
    if toplevel.is_empty() {
        return Err("Git repository has no top-level directory".to_string());
    }
    Ok(toplevel.to_string())
}

fn repository_has_head(repo_path: &str) -> Result<bool, String> {
    let mut command = git_command(repo_path)?;
    let output = command
        .args(["rev-parse", "--verify", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;
    Ok(output.status.success())
}

fn path_is_tracked(repo_path: &str, path: &str) -> Result<bool, String> {
    let mut command = git_command(repo_path)?;
    let output = command
        .args(["ls-files", "--error-unmatch", "--", path])
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;
    Ok(output.status.success())
}

fn validate_branch_name(repo_path: &str, name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    run_git(repo_path, &["check-ref-format", "--branch", name]).map(|_| ())
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
    fn parses_split_status_and_branch_tracking() {
        let status = parse_git_status(concat!(
            "# branch.oid abc123\0",
            "# branch.head feature/runtime\0",
            "# branch.upstream origin/feature/runtime\0",
            "# branch.ab +2 -3\0",
            "1 M. N... 100644 100644 100644 abc abc staged.txt\0",
            "1 .M N... 100644 100644 100644 abc abc worktree.txt\0",
            "1 MM N... 100644 100644 100644 abc abc both.txt\0",
            "? file with spaces.txt\0",
        ));

        assert_eq!(status.branch.as_deref(), Some("feature/runtime"));
        assert_eq!(
            status.upstream.as_deref(),
            Some("origin/feature/runtime")
        );
        assert_eq!(status.ahead, Some(2));
        assert_eq!(status.behind, Some(3));
        assert_eq!(status.staged.len(), 2);
        assert_eq!(status.staged[0].path, "staged.txt");
        assert_eq!(status.unstaged.len(), 2);
        assert_eq!(status.unstaged[0].path, "worktree.txt");
        assert_eq!(status.untracked.len(), 1);
        assert_eq!(status.untracked[0].path, "file with spaces.txt");
    }

    #[test]
    fn parses_rename_and_detached_head() {
        let status = parse_git_status(concat!(
            "# branch.oid abc123\0",
            "# branch.head (detached)\0",
            "2 R. N... 100644 100644 100644 abc abc R100 new name.rs\0",
            "old name.rs\0",
        ));

        assert_eq!(status.branch.as_deref(), Some("HEAD"));
        assert_eq!(status.upstream, None);
        assert_eq!(status.ahead, None);
        assert_eq!(status.behind, None);
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "new name.rs");
        assert_eq!(
            status.staged[0].renamed_from.as_deref(),
            Some("old name.rs")
        );
        assert!(status.unstaged.is_empty());
    }
}
