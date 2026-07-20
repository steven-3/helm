//! Shell-integration rc-file writer: installs a marked `source` block that
//! loads shim/helm-shell-integration.{sh,ps1} (OSC 133 prompt marks → command
//! blocks). The UI calls `shell_integration_preview` to show the exact block
//! BEFORE `shell_integration_install` touches the file; install is idempotent.
//!
//! Windows-side rc files (~/.bashrc for Git Bash, ~/.zshrc, $PROFILE) are
//! edited directly. WSL distros keep their rc INSIDE the distro filesystem, so
//! status/install shell out through `wsl.exe -d <distro> -- sh` and the block
//! sources the shim via its /mnt/<drive>/ translation (windows_path_to_wsl).

use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const MARKER_BEGIN: &str = "# >>> helm shell integration >>>";
const MARKER_END: &str = "# <<< helm shell integration <<<";
const WSL_SNIPPET: &str = "helm-shell-integration.sh";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RcStatus {
    /// "bash" | "zsh" | "powershell" | "wsl"
    pub shell: String,
    pub rc_path: String,
    pub exists: bool,
    /// The marker block is already present in the file.
    pub installed: bool,
    /// WSL distro name when the rc file lives inside a distro (shell "wsl").
    pub distro: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RcPreview {
    pub rc_path: String,
    /// The exact text install would append (markers included).
    pub block: String,
}

// status + install are async so the wsl.exe probes (which may cold-start a
// distro) run off the main thread — the sys.rs git-command precedent.
#[tauri::command]
pub async fn shell_integration_status(app: tauri::AppHandle) -> Result<Vec<RcStatus>, String> {
    let _ = &app; // uniform command signature; status needs no app resources today
    let home = home_dir().ok_or_else(|| "cannot resolve the home directory".to_string())?;
    let mut out = Vec::new();

    for (shell, path, include_only_if_exists) in rc_targets(&home) {
        let exists = path.is_file();
        if include_only_if_exists && !exists {
            continue;
        }
        let installed = exists
            && fs::read_to_string(&path)
                .map(|content| content.contains(MARKER_BEGIN))
                .unwrap_or(false);
        out.push(RcStatus {
            shell: shell.to_string(),
            rc_path: path.to_string_lossy().into_owned(),
            exists,
            installed,
            distro: None,
        });
    }

    // Each WSL distro owns its own ~/.bashrc inside the distro FS; probe it
    // through wsl.exe. A distro whose probe cannot even spawn is skipped,
    // matching shell_detect's "omit what we can't answer" contract.
    #[cfg(windows)]
    for distro in crate::shells::wsl_distro_names() {
        let Ok(content) = read_wsl_bashrc(&distro) else {
            continue;
        };
        out.push(RcStatus {
            shell: "wsl".to_string(),
            rc_path: wsl_rc_path(&distro),
            exists: content.is_some(),
            installed: content
                .as_deref()
                .map(|text| text.contains(MARKER_BEGIN))
                .unwrap_or(false),
            distro: Some(distro),
        });
    }

    Ok(out)
}

#[tauri::command]
pub fn shell_integration_preview(
    app: tauri::AppHandle,
    shell: String,
    distro: Option<String>,
) -> Result<RcPreview, String> {
    if let Some(distro) = normalized_distro(distro.as_deref()) {
        // WSL rows always send shell "wsl"; the distro names the target.
        return Ok(RcPreview {
            rc_path: wsl_rc_path(distro),
            block: wsl_integration_block(&app)?,
        });
    }

    let home = home_dir().ok_or_else(|| "cannot resolve the home directory".to_string())?;
    let path = rc_path_for(&home, &shell)?;
    let block = integration_block(&app, &shell)?;
    Ok(RcPreview {
        rc_path: path.to_string_lossy().into_owned(),
        block,
    })
}

/// Appends the marked block to the shell's rc file (creating file + parent
/// directories when missing). No-op when the marker is already present.
/// Returns the exact text appended ("" for the no-op). With `distro` set the
/// rc file is the distro's own ~/.bashrc, reached through wsl.exe.
#[tauri::command]
pub async fn shell_integration_install(
    app: tauri::AppHandle,
    shell: String,
    distro: Option<String>,
) -> Result<String, String> {
    if let Some(distro) = normalized_distro(distro.as_deref()) {
        return install_wsl(&app, distro);
    }

    let home = home_dir().ok_or_else(|| "cannot resolve the home directory".to_string())?;
    let path = rc_path_for(&home, &shell)?;
    let block = integration_block(&app, &shell)?;

    let existing = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("failed to read {}: {error}", path.display())),
    };
    if existing.contains(MARKER_BEGIN) {
        return Ok(String::new());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }

    let appended = appended_block(&existing, &block);
    let content = format!("{existing}{appended}");
    fs::write(&path, content)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    Ok(appended)
}

/// (shell id, rc path, only-list-when-file-exists)
fn rc_targets(home: &Path) -> Vec<(&'static str, PathBuf, bool)> {
    let mut targets = vec![
        ("bash", home.join(".bashrc"), false),
        // zsh is opt-in: only surfaced when the user actually has a ~/.zshrc.
        ("zsh", home.join(".zshrc"), true),
    ];
    if cfg!(windows) {
        targets.push(("powershell", powershell_profile(home), false));
    }
    targets
}

fn rc_path_for(home: &Path, shell: &str) -> Result<PathBuf, String> {
    match shell {
        "bash" => Ok(home.join(".bashrc")),
        "zsh" => Ok(home.join(".zshrc")),
        "powershell" if cfg!(windows) => Ok(powershell_profile(home)),
        other => Err(format!("unsupported shell for integration: {other}")),
    }
}

/// $PROFILE without spawning PowerShell: an existing profile file wins (either
/// generation), then an existing profile DIRECTORY (present ⇒ that PowerShell
/// generation is in use), then the modern PowerShell 7 default.
fn powershell_profile(home: &Path) -> PathBuf {
    const PROFILE_FILE: &str = "Microsoft.PowerShell_profile.ps1";
    let modern = home.join("Documents").join("PowerShell");
    let legacy = home.join("Documents").join("WindowsPowerShell");

    for dir in [&modern, &legacy] {
        if dir.join(PROFILE_FILE).is_file() {
            return dir.join(PROFILE_FILE);
        }
    }
    for dir in [&modern, &legacy] {
        if dir.is_dir() {
            return dir.join(PROFILE_FILE);
        }
    }
    modern.join(PROFILE_FILE)
}

fn integration_block(app: &tauri::AppHandle, shell: &str) -> Result<String, String> {
    let shim_dir = crate::pty::resolve_shim_dir(app);
    let (snippet, loader) = match shell {
        "bash" | "zsh" => ("helm-shell-integration.sh", "source"),
        "powershell" => ("helm-shell-integration.ps1", "."),
        other => return Err(format!("unsupported shell for integration: {other}")),
    };
    let snippet_path = shim_dir.join(snippet);
    if !snippet_path.is_file() {
        return Err(format!(
            "integration snippet not found: {}",
            snippet_path.display()
        ));
    }
    Ok(format!(
        "{MARKER_BEGIN}\n{loader} \"{}\"\n{MARKER_END}\n",
        snippet_path.display()
    ))
}

/// Separate from existing content with a blank line; repair a missing trailing
/// newline first so the markers always start at column 0.
fn appended_block(existing: &str, block: &str) -> String {
    if existing.is_empty() {
        block.to_string()
    } else if existing.ends_with('\n') {
        format!("\n{block}")
    } else {
        format!("\n\n{block}")
    }
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .or_else(|| env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
        .map(PathBuf::from)
}

/* ─────────────────────────────── WSL ─────────────────────────────────────── */

fn normalized_distro(distro: Option<&str>) -> Option<&str> {
    distro.map(str::trim).filter(|name| !name.is_empty())
}

/// Display path for a distro's rc file — self-describing for status, preview
/// titles, and error messages alike.
fn wsl_rc_path(distro: &str) -> String {
    format!("~/.bashrc ({distro})")
}

/// The block a WSL distro's ~/.bashrc gets: same markers, but the shim is
/// sourced via its /mnt/<drive>/ path (the Windows install dir seen from WSL).
fn wsl_integration_block(app: &tauri::AppHandle) -> Result<String, String> {
    let snippet_path = crate::pty::resolve_shim_dir(app).join(WSL_SNIPPET);
    if !snippet_path.is_file() {
        return Err(format!(
            "integration snippet not found: {}",
            snippet_path.display()
        ));
    }
    let wsl_path = windows_path_to_wsl(&snippet_path.to_string_lossy()).ok_or_else(|| {
        format!(
            "cannot express {} as a WSL path",
            snippet_path.display()
        )
    })?;
    Ok(wsl_source_block(&wsl_path))
}

fn wsl_source_block(path: &str) -> String {
    format!("{MARKER_BEGIN}\nsource \"{path}\"\n{MARKER_END}\n")
}

/// `C:\foo\bar` → `/mnt/c/foo/bar` (any drive letter; forward or back slashes;
/// `\\?\` verbatim prefix stripped). An already-POSIX path passes through
/// (dev on a WSL host). UNC and relative paths are refused — the caller needs
/// a path the distro can source.
pub(crate) fn windows_path_to_wsl(path: &str) -> Option<String> {
    let path = path.strip_prefix(r"\\?\").unwrap_or(path);
    if path.starts_with('/') {
        return Some(path.to_string());
    }
    let normalized = path.replace('\\', "/");
    let bytes = normalized.as_bytes();
    if bytes.len() < 2 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' {
        return None;
    }
    let drive = (bytes[0] as char).to_ascii_lowercase();
    let rest = normalized[2..].trim_start_matches('/');
    if rest.is_empty() {
        Some(format!("/mnt/{drive}"))
    } else {
        Some(format!("/mnt/{drive}/{rest}"))
    }
}

#[cfg(windows)]
fn install_wsl(app: &tauri::AppHandle, distro: &str) -> Result<String, String> {
    let block = wsl_integration_block(app)?;
    let existing = read_wsl_bashrc(distro)?.unwrap_or_default();
    if existing.contains(MARKER_BEGIN) {
        return Ok(String::new());
    }
    let appended = appended_block(&existing, &block);
    append_wsl_bashrc(distro, &appended)?;
    Ok(appended)
}

#[cfg(not(windows))]
fn install_wsl(_app: &tauri::AppHandle, distro: &str) -> Result<String, String> {
    Err(format!("WSL shell integration for {distro} requires Windows"))
}

/// Ok(Some(content)) when the distro's ~/.bashrc exists, Ok(None) when it
/// doesn't (cat fails inside the distro), Err when wsl.exe itself cannot run.
/// Output here is UTF-8 — only `wsl -l` writes UTF-16 (see shells.rs); command
/// output from inside the distro passes through as raw bytes. Plain `sh -c`
/// (not -l) so login scripts can't pollute stdout and fake the marker check.
#[cfg(windows)]
fn read_wsl_bashrc(distro: &str) -> Result<Option<String>, String> {
    let output = std::process::Command::new("wsl.exe")
        .args(["-d", distro, "--", "sh", "-c", "cat ~/.bashrc 2>/dev/null"])
        .creation_flags(crate::sys::CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("failed to run wsl.exe: {error}"))?;
    if output.status.success() {
        Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()))
    } else {
        Ok(None)
    }
}

/// `cat >> ~/.bashrc` with the block on stdin: append + create-if-missing in
/// one step, and the block content is never shell-quoted anywhere (argv on the
/// Windows side, raw bytes into cat on the WSL side).
#[cfg(windows)]
fn append_wsl_bashrc(distro: &str, text: &str) -> Result<(), String> {
    use std::io::Write as _;
    use std::process::Stdio;

    let mut child = std::process::Command::new("wsl.exe")
        .args(["-d", distro, "--", "sh", "-c", "cat >> ~/.bashrc"])
        .creation_flags(crate::sys::CREATE_NO_WINDOW)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to run wsl.exe: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "wsl.exe stdin unavailable".to_string())?
        .write_all(text.as_bytes())
        .map_err(|error| format!("failed to write ~/.bashrc ({distro}): {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to wait for wsl.exe: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "failed to append to ~/.bashrc ({distro}): {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{appended_block, windows_path_to_wsl, wsl_source_block, MARKER_BEGIN, MARKER_END};

    #[test]
    fn translates_windows_paths_to_wsl() {
        assert_eq!(
            windows_path_to_wsl(r"C:\foo\bar"),
            Some("/mnt/c/foo/bar".to_string())
        );
        assert_eq!(
            windows_path_to_wsl(r"D:\Program Files\Helm\shim\helm-shell-integration.sh"),
            Some("/mnt/d/Program Files/Helm/shim/helm-shell-integration.sh".to_string())
        );
        assert_eq!(
            windows_path_to_wsl("C:/mixed/slashes"),
            Some("/mnt/c/mixed/slashes".to_string())
        );
        assert_eq!(
            windows_path_to_wsl(r"\\?\E:\verbatim\path"),
            Some("/mnt/e/verbatim/path".to_string())
        );
        assert_eq!(windows_path_to_wsl(r"C:\"), Some("/mnt/c".to_string()));
        // Already-POSIX (dev on a WSL host) passes through; UNC and relative
        // forms are refused.
        assert_eq!(
            windows_path_to_wsl("/mnt/e/Projects/helm/shim/x.sh"),
            Some("/mnt/e/Projects/helm/shim/x.sh".to_string())
        );
        assert_eq!(windows_path_to_wsl(r"relative\path"), None);
        assert_eq!(windows_path_to_wsl(r"\\server\share\x"), None);
        assert_eq!(windows_path_to_wsl(""), None);
    }

    #[test]
    fn wsl_block_sources_translated_shim() {
        let block =
            wsl_source_block("/mnt/c/Users/u/AppData/Local/Programs/helm/shim/helm-shell-integration.sh");
        assert!(block.starts_with(MARKER_BEGIN));
        assert!(block.contains(
            "source \"/mnt/c/Users/u/AppData/Local/Programs/helm/shim/helm-shell-integration.sh\""
        ));
        assert!(block.ends_with(&format!("{MARKER_END}\n")));
    }

    #[test]
    fn appended_block_repairs_newlines() {
        assert_eq!(appended_block("", "B\n"), "B\n");
        assert_eq!(appended_block("x\n", "B\n"), "\nB\n");
        assert_eq!(appended_block("x", "B\n"), "\n\nB\n");
    }
}
