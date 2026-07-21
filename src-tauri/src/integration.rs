//! Shell-integration rc-file writer: installs a marked block that loads the
//! Helm OSC 133 integration snippet (prompt marks → command blocks). The UI
//! calls `shell_integration_preview` to show the exact block BEFORE
//! `shell_integration_install` touches the file; install is idempotent AND
//! self-healing.
//!
//! bash-family targets (Git Bash / zsh on the Windows side, and every WSL
//! distro's own ~/.bashrc) never source the shipped shim directly: a Windows
//! checkout/installer can leave the .sh with CRLF endings, and a `/mnt/<drive>`
//! path ties WSL to the install location. Instead install copies the snippet —
//! with every `\r` stripped — to `~/.config/helm/shell-integration.sh` (the
//! Windows home for Git Bash/zsh, the distro's home for WSL, written through
//! `wsl.exe -d <distro> -- sh -c 'cat > …'`), and the rc block sources that
//! managed path. Status reports `installed: false` for a stale block (the old
//! /mnt-style source line) or a missing/outdated managed copy, so clicking
//! "Add" again repairs the install in place. PowerShell keeps dot-sourcing the
//! shipped .ps1 (CRLF is native there).

use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const MARKER_BEGIN: &str = "# >>> helm shell integration >>>";
const MARKER_END: &str = "# <<< helm shell integration <<<";
/// Shipped snippet the managed copy is made from.
const SHIPPED_SNIPPET: &str = "helm-shell-integration.sh";
/// Managed copy location relative to the target home (`$HOME/…` in the block).
const MANAGED_SNIPPET_REL: &str = ".config/helm/shell-integration.sh";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RcStatus {
    /// "bash" | "zsh" | "powershell" | "wsl"
    pub shell: String,
    pub rc_path: String,
    pub exists: bool,
    /// The CURRENT marker block is present and its managed snippet copy is up
    /// to date. A legacy /mnt-style block or a missing/stale managed copy
    /// reports false so the UI offers "Add" again — install then repairs.
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
    let home = home_dir().ok_or_else(|| "cannot resolve the home directory".to_string())?;
    // The reference snippet for staleness checks; unreadable ⇒ None and the
    // managed-copy comparison is skipped (block shape still decides).
    let shipped = sanitized_snippet(&app).ok();
    let mut out = Vec::new();

    for (shell, path, include_only_if_exists) in rc_targets(&home) {
        let exists = path.is_file();
        if include_only_if_exists && !exists {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        let installed = match shell {
            "powershell" => content.contains(MARKER_BEGIN),
            _ => {
                block_is_current(&content)
                    && managed_matches(local_managed_content(&home).as_deref(), shipped.as_deref())
            }
        };
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
        let Ok((managed, bashrc)) = read_wsl_state(&distro) else {
            continue;
        };
        out.push(RcStatus {
            shell: "wsl".to_string(),
            rc_path: wsl_rc_path(&distro),
            exists: bashrc.is_some(),
            installed: bashrc.as_deref().map(block_is_current).unwrap_or(false)
                && managed_matches(managed.as_deref(), shipped.as_deref()),
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
        // Verify the shipped snippet exists up front — install copies from it.
        sanitized_snippet(&app)?;
        return Ok(RcPreview {
            rc_path: wsl_rc_path(distro),
            block: managed_block(),
        });
    }

    let home = home_dir().ok_or_else(|| "cannot resolve the home directory".to_string())?;
    let path = rc_path_for(&home, &shell)?;
    let block = match shell.as_str() {
        "bash" | "zsh" => {
            sanitized_snippet(&app)?;
            managed_block()
        }
        _ => powershell_block(&app)?,
    };
    Ok(RcPreview {
        rc_path: path.to_string_lossy().into_owned(),
        block,
    })
}

/// Writes the managed snippet copy and appends the marked block to the shell's
/// rc file (creating file + parent directories when missing). Idempotent: a
/// current block is left alone (though the managed copy is still refreshed —
/// self-healing); a legacy/stale block is REPLACED. Returns the exact text
/// appended ("" when the rc file did not change). With `distro` set the rc
/// file is the distro's own ~/.bashrc, reached through wsl.exe.
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
    match shell.as_str() {
        "bash" | "zsh" => install_local_bash_family(&app, &home, &path),
        _ => install_powershell(&app, &path),
    }
}

fn install_local_bash_family(
    app: &tauri::AppHandle,
    home: &Path,
    rc_path: &Path,
) -> Result<String, String> {
    let snippet = sanitized_snippet(app)?;
    let managed_path = local_managed_path(home);
    if let Some(parent) = managed_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    // Always rewritten so a stale or hand-damaged copy heals on every install.
    fs::write(&managed_path, &snippet)
        .map_err(|error| format!("failed to write {}: {error}", managed_path.display()))?;

    let existing = read_rc(rc_path)?;
    if block_is_current(&existing) {
        return Ok(String::new());
    }
    let stripped = remove_helm_block(&existing);
    let appended = appended_block(&stripped, &managed_block());
    write_rc(rc_path, &format!("{stripped}{appended}"))?;
    Ok(appended)
}

fn install_powershell(app: &tauri::AppHandle, rc_path: &Path) -> Result<String, String> {
    let block = powershell_block(app)?;
    let existing = read_rc(rc_path)?;
    if existing.contains(MARKER_BEGIN) {
        return Ok(String::new());
    }
    let appended = appended_block(&existing, &block);
    write_rc(rc_path, &format!("{existing}{appended}"))?;
    Ok(appended)
}

fn read_rc(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("failed to read {}: {error}", path.display())),
    }
}

fn write_rc(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::write(path, content).map_err(|error| format!("failed to write {}: {error}", path.display()))
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

/// PowerShell dot-sources the shipped .ps1 directly — CRLF is native there and
/// $PROFILE lives on the same drive as the install.
fn powershell_block(app: &tauri::AppHandle) -> Result<String, String> {
    let snippet_path = crate::pty::resolve_shim_dir(app).join("helm-shell-integration.ps1");
    if !snippet_path.is_file() {
        return Err(format!(
            "integration snippet not found: {}",
            snippet_path.display()
        ));
    }
    // Belt & braces: the block string itself must never carry a \r.
    Ok(strip_cr(&format!(
        "{MARKER_BEGIN}\n. \"{}\"\n{MARKER_END}\n",
        snippet_path.display()
    )))
}

/* ── managed snippet copy (bash family: Git Bash, zsh, WSL) ───────────────── */

/// The rc block every bash-family target gets: source the managed LF copy via
/// $HOME (no drive letters), guarded so a removed copy is a silent no-op
/// instead of a per-prompt error.
fn managed_block() -> String {
    strip_cr(&format!(
        "{MARKER_BEGIN}\nif [ -f \"$HOME/{MANAGED_SNIPPET_REL}\" ]; then . \"$HOME/{MANAGED_SNIPPET_REL}\"; fi\n{MARKER_END}\n"
    ))
}

fn strip_cr(text: &str) -> String {
    text.replace('\r', "")
}

/// Shipped shim .sh with every `\r` stripped — the exact bytes every managed
/// copy receives, and the reference for staleness checks.
fn sanitized_snippet(app: &tauri::AppHandle) -> Result<String, String> {
    let snippet_path = crate::pty::resolve_shim_dir(app).join(SHIPPED_SNIPPET);
    match fs::read_to_string(&snippet_path) {
        Ok(content) => Ok(strip_cr(&content)),
        Err(error) => Err(format!(
            "integration snippet not found: {} ({error})",
            snippet_path.display()
        )),
    }
}

fn local_managed_path(home: &Path) -> PathBuf {
    // MANAGED_SNIPPET_REL is '/'-separated; join per component for Windows.
    let mut path = home.to_path_buf();
    for part in MANAGED_SNIPPET_REL.split('/') {
        path.push(part);
    }
    path
}

fn local_managed_content(home: &Path) -> Option<String> {
    fs::read_to_string(local_managed_path(home)).ok()
}

/// Managed copy freshness: with no readable shipped reference the check is
/// waived (block shape alone decides); otherwise the copy must match exactly.
fn managed_matches(managed: Option<&str>, shipped: Option<&str>) -> bool {
    match shipped {
        None => true,
        Some(reference) => managed == Some(reference),
    }
}

/// True when a marker block exists AND it sources the managed copy (the
/// current shape). Legacy blocks (`source "/mnt/…/shim/helm-shell-integration
/// .sh"`) return false → status offers repair. `\r`-polluted files are
/// flattened before scanning so CRLF line endings can't hide the markers.
fn block_is_current(content: &str) -> bool {
    let flat = strip_cr(content);
    let Some(start) = flat.find(MARKER_BEGIN) else {
        return false;
    };
    let end = flat[start..]
        .find(MARKER_END)
        .map(|offset| start + offset)
        .unwrap_or(flat.len());
    flat[start..end].contains(MANAGED_SNIPPET_REL)
}

/// Removes every marker block (markers included), tolerating `\r` line endings
/// and indentation on the marker lines. Content without markers passes through
/// unchanged; all other lines are preserved byte-for-byte.
fn remove_helm_block(content: &str) -> String {
    if !content.contains(MARKER_BEGIN) {
        return content.to_string();
    }
    let mut out = String::with_capacity(content.len());
    let mut in_block = false;
    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']).trim();
        if !in_block && trimmed == MARKER_BEGIN {
            in_block = true;
            continue;
        }
        if in_block {
            if trimmed == MARKER_END {
                in_block = false;
            }
            continue;
        }
        out.push_str(line);
    }
    out
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

#[cfg(windows)]
fn install_wsl(app: &tauri::AppHandle, distro: &str) -> Result<String, String> {
    let snippet = sanitized_snippet(app)?;
    let (_, bashrc) = read_wsl_state(distro)?;
    let existing = bashrc.unwrap_or_default();

    // Refresh the in-distro managed copy first — even a "no rc change" install
    // self-heals a missing or stale copy.
    write_wsl_managed(distro, &snippet)?;

    if block_is_current(&existing) {
        return Ok(String::new());
    }
    let stripped = remove_helm_block(&existing);
    let appended = appended_block(&stripped, &managed_block());
    if stripped == existing {
        // No legacy block to replace — plain append (create-if-missing).
        write_wsl_bashrc(distro, &appended, true)?;
    } else {
        // Legacy /mnt-style block replaced — the whole file is rewritten with
        // the content read moments ago plus the fresh block.
        write_wsl_bashrc(distro, &format!("{stripped}{appended}"), false)?;
    }
    Ok(appended)
}

#[cfg(not(windows))]
fn install_wsl(_app: &tauri::AppHandle, distro: &str) -> Result<String, String> {
    Err(format!("WSL shell integration for {distro} requires Windows"))
}

/// Sentinel separating the two cats of the combined state probe. Printed on
/// its own line so splitting is unambiguous regardless of trailing newlines.
#[cfg(windows)]
const WSL_PROBE_SPLIT: &str = "__HELM_STATUS_SPLIT__";

/// One wsl.exe round-trip per distro: (managed snippet copy if present,
/// Some(~/.bashrc content) when the file exists). Err when the probe cannot
/// run at all (wsl.exe missing, distro broken — no sentinel in the output).
/// Output here is UTF-8 — only `wsl -l` writes UTF-16 (see shells.rs); command
/// output from inside the distro passes through as raw bytes. Plain `sh -c`
/// (not -l) so login scripts can't pollute stdout and fake the marker check.
#[cfg(windows)]
fn read_wsl_state(distro: &str) -> Result<(Option<String>, Option<String>), String> {
    let script = format!(
        "cat ~/{MANAGED_SNIPPET_REL} 2>/dev/null; printf '\\n{WSL_PROBE_SPLIT}\\n'; cat ~/.bashrc 2>/dev/null"
    );
    let output = std::process::Command::new("wsl.exe")
        .args(["-d", distro, "--", "sh", "-c", &script])
        .creation_flags(crate::sys::CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("failed to run wsl.exe: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let sentinel = format!("\n{WSL_PROBE_SPLIT}\n");
    let Some((managed_part, bashrc_part)) = stdout.split_once(&sentinel) else {
        // The sh never ran — treat like a spawn failure so callers skip.
        return Err(format!("wsl.exe probe failed for {distro}"));
    };
    let managed = (!managed_part.is_empty()).then(|| managed_part.to_string());
    // The exit status is the LAST cat's: success ⇔ ~/.bashrc exists.
    let bashrc = output.status.success().then(|| bashrc_part.to_string());
    Ok((managed, bashrc))
}

/// `mkdir -p && cat > ~/.config/helm/shell-integration.sh` with the sanitized
/// snippet on stdin: the distro gets a native LF copy on its own filesystem —
/// no /mnt drive-letter dependency, no CRLF regardless of shipped endings.
#[cfg(windows)]
fn write_wsl_managed(distro: &str, content: &str) -> Result<(), String> {
    let script = format!("mkdir -p ~/.config/helm && cat > ~/{MANAGED_SNIPPET_REL}");
    run_wsl_with_stdin(distro, &script, content)
        .map_err(|error| format!("failed to write ~/{MANAGED_SNIPPET_REL} ({distro}): {error}"))
}

/// `cat >>` (append=true) or `cat >` (full rewrite, for block replacement)
/// into ~/.bashrc with the text on stdin: content is never shell-quoted
/// anywhere (argv on the Windows side, raw bytes into cat on the WSL side).
#[cfg(windows)]
fn write_wsl_bashrc(distro: &str, text: &str, append: bool) -> Result<(), String> {
    let script = if append {
        "cat >> ~/.bashrc"
    } else {
        "cat > ~/.bashrc"
    };
    run_wsl_with_stdin(distro, script, text)
        .map_err(|error| format!("failed to write ~/.bashrc ({distro}): {error}"))
}

#[cfg(windows)]
fn run_wsl_with_stdin(distro: &str, script: &str, stdin_text: &str) -> Result<(), String> {
    use std::io::Write as _;
    use std::process::Stdio;

    let mut child = std::process::Command::new("wsl.exe")
        .args(["-d", distro, "--", "sh", "-c", script])
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
        .write_all(stdin_text.as_bytes())
        .map_err(|error| error.to_string())?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to wait for wsl.exe: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        appended_block, block_is_current, managed_block, remove_helm_block, strip_cr,
        MANAGED_SNIPPET_REL, MARKER_BEGIN, MARKER_END,
    };

    #[test]
    fn strips_carriage_returns() {
        assert_eq!(strip_cr("a\r\nb\r\n"), "a\nb\n");
        assert_eq!(strip_cr("plain\nlf\n"), "plain\nlf\n");
        // The CI-poisoned shim shape that produced `$'{\r'` syntax errors.
        assert_eq!(
            strip_cr("__helm_osc133() {\r\n  printf 'x'\r\n}\r\n"),
            "__helm_osc133() {\n  printf 'x'\n}\n"
        );
    }

    #[test]
    fn managed_block_is_guarded_lf_and_home_relative() {
        let block = managed_block();
        assert!(block.starts_with(MARKER_BEGIN));
        assert!(block.ends_with(&format!("{MARKER_END}\n")));
        assert!(!block.contains('\r'));
        assert!(block.contains(&format!("$HOME/{MANAGED_SNIPPET_REL}")));
        // Guarded: a deleted managed copy must be a silent no-op, not an error.
        assert!(block.contains("if [ -f"));
        // No drive letters / install-dir paths anywhere in the block.
        assert!(!block.contains("/mnt/"));
    }

    #[test]
    fn detects_current_vs_legacy_blocks() {
        assert!(block_is_current(&format!("PATH=x\n\n{}", managed_block())));
        // CRLF endings must not hide a current block.
        assert!(block_is_current(&managed_block().replace('\n', "\r\n")));
        // Legacy /mnt-style block (the 0.5.2 shape) ⇒ needs repair.
        let legacy = format!(
            "{MARKER_BEGIN}\nsource \"/mnt/e/Helm/shim/helm-shell-integration.sh\"\n{MARKER_END}\n"
        );
        assert!(!block_is_current(&legacy));
        assert!(!block_is_current("no markers at all\n"));
    }

    #[test]
    fn removes_legacy_block_preserving_neighbors() {
        let legacy = format!(
            "export A=1\n\n{MARKER_BEGIN}\nsource \"/mnt/e/Helm/shim/helm-shell-integration.sh\"\n{MARKER_END}\nexport B=2\n"
        );
        assert_eq!(remove_helm_block(&legacy), "export A=1\n\nexport B=2\n");
        // CRLF variant (Windows-written rc): markers end with \r but still match.
        let crlf = legacy.replace('\n', "\r\n");
        assert_eq!(
            remove_helm_block(&crlf),
            "export A=1\r\n\r\nexport B=2\r\n"
        );
        // No markers ⇒ untouched.
        assert_eq!(remove_helm_block("plain\n"), "plain\n");
    }

    #[test]
    fn repair_replaces_legacy_block_with_managed_block() {
        let legacy = format!(
            "export A=1\n\n{MARKER_BEGIN}\nsource \"/mnt/e/Helm/shim/helm-shell-integration.sh\"\n{MARKER_END}\n"
        );
        let stripped = remove_helm_block(&legacy);
        let repaired = format!("{stripped}{}", appended_block(&stripped, &managed_block()));
        assert!(block_is_current(&repaired));
        assert!(!repaired.contains("/mnt/"));
        assert_eq!(repaired.matches(MARKER_BEGIN).count(), 1);
    }

    #[test]
    fn appended_block_repairs_newlines() {
        assert_eq!(appended_block("", "B\n"), "B\n");
        assert_eq!(appended_block("x\n", "B\n"), "\nB\n");
        assert_eq!(appended_block("x", "B\n"), "\n\nB\n");
    }
}
