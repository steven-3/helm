//! Shell-integration rc-file writer: installs a marked `source` block that
//! loads shim/helm-shell-integration.{sh,ps1} (OSC 133 prompt marks → command
//! blocks). The UI calls `shell_integration_preview` to show the exact block
//! BEFORE `shell_integration_install` touches the file; install is idempotent.

use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const MARKER_BEGIN: &str = "# >>> helm shell integration >>>";
const MARKER_END: &str = "# <<< helm shell integration <<<";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RcStatus {
    /// "bash" | "zsh" | "powershell"
    pub shell: String,
    pub rc_path: String,
    pub exists: bool,
    /// The marker block is already present in the file.
    pub installed: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RcPreview {
    pub rc_path: String,
    /// The exact text install would append (markers included).
    pub block: String,
}

#[tauri::command]
pub fn shell_integration_status(app: tauri::AppHandle) -> Result<Vec<RcStatus>, String> {
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
        });
    }

    Ok(out)
}

#[tauri::command]
pub fn shell_integration_preview(app: tauri::AppHandle, shell: String) -> Result<RcPreview, String> {
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
/// Returns the exact text appended ("" for the no-op).
#[tauri::command]
pub fn shell_integration_install(app: tauri::AppHandle, shell: String) -> Result<String, String> {
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

    // Separate from existing content with a blank line; repair a missing
    // trailing newline first so the markers always start at column 0.
    let appended = if existing.is_empty() {
        block
    } else if existing.ends_with('\n') {
        format!("\n{block}")
    } else {
        format!("\n\n{block}")
    };

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

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .or_else(|| env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
        .map(PathBuf::from)
}
