//! Shell detection for onboarding + profile auto-creation.
//!
//! `shell_detect` NEVER fails: every probe that comes up empty is simply
//! omitted, so a machine with nothing but cmd.exe still gets a usable answer.

use serde::Serialize;
use std::env;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::process::Command;

/// One launchable shell found on this machine. `command` is ready to store in
/// a TerminalProfile verbatim (pty.rs tokenizes quoted multi-word commands for
/// direct spawns). `path` is the resolved executable when the probe found one.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct DetectedShell {
    pub id: String,
    pub label: String,
    pub command: String,
    /// "cmd" | "powershell" | "pwsh" | "bash" | "wsl" | "zsh" | "fish"
    pub kind: String,
    pub path: Option<String>,
}

#[tauri::command]
pub fn shell_detect() -> Vec<DetectedShell> {
    let mut out = Vec::new();

    #[cfg(windows)]
    detect_windows(&mut out);

    #[cfg(not(windows))]
    detect_unix(&mut out);

    out
}

/// Stable id fragment from a free-form name (WSL distro names especially):
/// lowercase, runs of non-alphanumerics collapse to one '-'.
fn slug(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut pending_dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.push(ch.to_ascii_lowercase());
        } else {
            pending_dash = true;
        }
    }
    out
}

/// Resolve a command name to an existing file, either directly (absolute path)
/// or through PATH. (Unix detection reads $SHELL + /etc/shells instead.)
#[cfg_attr(not(windows), allow(dead_code))]
fn find_on_path(name: &str) -> Option<PathBuf> {
    let direct = Path::new(name);
    if direct.is_absolute() {
        return direct.is_file().then(|| direct.to_path_buf());
    }
    env::var_os("PATH").and_then(|path| {
        env::split_paths(&path)
            .map(|dir| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
}

/* ─────────────────────────────── Windows ─────────────────────────────────── */

#[cfg(windows)]
fn detect_windows(out: &mut Vec<DetectedShell>) {
    // cmd.exe — ComSpec is authoritative; PATH is the fallback.
    let cmd = env::var_os("ComSpec")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| find_on_path("cmd.exe"));
    if let Some(path) = cmd {
        out.push(DetectedShell {
            id: "cmd".to_string(),
            label: "Command Prompt".to_string(),
            command: "cmd.exe".to_string(),
            kind: "cmd".to_string(),
            path: Some(path.to_string_lossy().into_owned()),
        });
    }

    // Windows PowerShell 5 ships with the OS; pwsh 7 is a separate install.
    if let Some(path) = find_on_path("powershell.exe") {
        out.push(DetectedShell {
            id: "powershell".to_string(),
            label: "Windows PowerShell".to_string(),
            command: "powershell.exe".to_string(),
            kind: "powershell".to_string(),
            path: Some(path.to_string_lossy().into_owned()),
        });
    }
    if let Some(path) = find_on_path("pwsh.exe") {
        out.push(DetectedShell {
            id: "pwsh".to_string(),
            label: "PowerShell 7".to_string(),
            command: "pwsh.exe".to_string(),
            kind: "pwsh".to_string(),
            path: Some(path.to_string_lossy().into_owned()),
        });
    }

    if let Some(path) = find_git_bash() {
        out.push(DetectedShell {
            id: "git-bash".to_string(),
            label: "Git Bash".to_string(),
            // Full path: Git's bin dir is normally NOT on PATH. pty.rs treats
            // an existing file path (spaces included) as the program verbatim.
            command: path.to_string_lossy().into_owned(),
            kind: "bash".to_string(),
            path: Some(path.to_string_lossy().into_owned()),
        });
    }

    out.extend(detect_wsl_distros());
}

#[cfg(windows)]
fn find_git_bash() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(base) = env::var_os(var) {
            candidates.push(PathBuf::from(base).join("Git").join("bin").join("bash.exe"));
        }
    }
    if let Some(base) = env::var_os("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(base)
                .join("Programs")
                .join("Git")
                .join("bin")
                .join("bash.exe"),
        );
    }
    if let Some(found) = candidates.into_iter().find(|path| path.is_file()) {
        return Some(found);
    }
    // PATH fallback — but System32\bash.exe is the WSL launcher, not Git Bash.
    find_on_path("bash.exe").filter(|path| {
        !path
            .to_string_lossy()
            .to_ascii_lowercase()
            .contains("system32")
    })
}

#[cfg(windows)]
fn detect_wsl_distros() -> Vec<DetectedShell> {
    parse_wsl_distros(&wsl_distro_names().join("\n"))
}

/// Shared `wsl.exe -l -q` probe: the installed distro names, decoded from
/// wsl.exe's UTF-16 listing. Empty on any failure (no WSL, no distros) —
/// callers treat that as "nothing to offer". integration.rs reuses this to
/// know which distros own a ~/.bashrc worth managing.
#[cfg(windows)]
pub(crate) fn wsl_distro_names() -> Vec<String> {
    let mut command = Command::new("wsl.exe");
    command.args(["-l", "-q"]);
    command.creation_flags(crate::sys::CREATE_NO_WINDOW);
    let output = match command.output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    parse_wsl_names(&decode_wsl_output(&output.stdout))
}

/* ── platform-neutral parsing helpers (unit-testable on any host) ─────────── */

/// wsl.exe writes UTF-16LE when its stdout is a pipe. Detect via BOM or the
/// characteristic NUL density and decode accordingly; plain UTF-8 passes
/// through (some wrappers re-encode).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn decode_wsl_output(bytes: &[u8]) -> String {
    let has_bom = bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE;
    let nul_heavy = !bytes.is_empty()
        && bytes.iter().filter(|byte| **byte == 0).count() * 4 > bytes.len();
    if has_bom || nul_heavy {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16_lossy(&units)
            .trim_start_matches('\u{feff}')
            .to_string()
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// Distro names from a decoded `wsl -l -q` listing (blank lines and stray
/// NUL/CR artifacts dropped).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn parse_wsl_names(text: &str) -> Vec<String> {
    text.lines()
        .map(|line| line.replace(['\0', '\r'], ""))
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn parse_wsl_distros(text: &str) -> Vec<DetectedShell> {
    parse_wsl_names(text)
        .into_iter()
        .map(|name| DetectedShell {
            id: format!("wsl-{}", slug(&name)),
            label: name.clone(),
            // --shell-type login: a bare wsl.exe launch is a NON-login shell
            // (no /etc/profile, no ~/.profile → user PATH missing), unlike
            // Windows Terminal distro profiles. The flag has shipped since the
            // 0.61.x store releases (mid-2022) — every lifted WSL2 has it.
            command: format!("wsl.exe -d \"{name}\" --cd ~ --shell-type login"),
            kind: "wsl".to_string(),
            path: None,
        })
        .collect()
}

/* ──────────────────────────────── Unix ───────────────────────────────────── */

#[cfg(not(windows))]
fn detect_unix(out: &mut Vec<DetectedShell>) {
    let push = |path: PathBuf, out: &mut Vec<DetectedShell>| {
        let Some(name) = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
        else {
            return;
        };
        if !matches!(name.as_str(), "bash" | "zsh" | "fish") {
            return;
        }
        if out.iter().any(|shell| shell.id == name) {
            return;
        }
        let mut label: Vec<char> = name.chars().collect();
        label[0] = label[0].to_ascii_uppercase();
        out.push(DetectedShell {
            id: name.clone(),
            label: label.into_iter().collect(),
            command: path.to_string_lossy().into_owned(),
            kind: name,
            path: Some(path.to_string_lossy().into_owned()),
        });
    };

    // The login shell first, so it leads the detected list.
    if let Ok(shell) = env::var("SHELL") {
        let path = PathBuf::from(shell.trim());
        if path.is_file() {
            push(path, out);
        }
    }

    // /etc/shells lists everything installed; keep the common interactive ones.
    if let Ok(listing) = std::fs::read_to_string("/etc/shells") {
        for line in listing.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let path = PathBuf::from(line);
            if path.is_file() {
                push(path, out);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_wsl_output, parse_wsl_distros, slug};

    #[test]
    fn slugs_distro_names() {
        assert_eq!(slug("Ubuntu-22.04"), "ubuntu-22-04");
        assert_eq!(slug("openSUSE Leap 15.6"), "opensuse-leap-15-6");
        assert_eq!(slug("Debian"), "debian");
    }

    #[test]
    fn decodes_utf16le_wsl_listing() {
        // "Ubuntu\r\nDebian\r\n" as UTF-16LE with BOM.
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "Ubuntu\r\nDebian\r\n".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let distros = parse_wsl_distros(&decode_wsl_output(&bytes));
        assert_eq!(distros.len(), 2);
        assert_eq!(distros[0].id, "wsl-ubuntu");
        // Login shell so ~/.profile / user PATH load like Windows Terminal.
        assert_eq!(
            distros[0].command,
            "wsl.exe -d \"Ubuntu\" --cd ~ --shell-type login"
        );
        assert_eq!(distros[1].label, "Debian");
    }

    #[test]
    fn passes_utf8_through_and_skips_blank_lines() {
        let distros = parse_wsl_distros(&decode_wsl_output(b"Ubuntu\n\n"));
        assert_eq!(distros.len(), 1);
        assert_eq!(distros[0].kind, "wsl");
    }
}
