use portable_pty::{
    native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::{env, thread};
use tauri::{ipc::Channel, Manager};

const READ_BUFFER_SIZE: usize = 16 * 1024;

type SharedChild = Arc<Mutex<Box<dyn Child + Send + Sync>>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnOpts {
    pub pane_id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    Data { bytes: Vec<u8> },
    Exit { code: Option<i32> },
}

struct PtySession {
    child: SharedChild,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

#[tauri::command]
pub fn pty_spawn(
    app: tauri::AppHandle,
    manager: tauri::State<'_, PtyManager>,
    opts: PtySpawnOpts,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    {
        let sessions = manager
            .sessions
            .lock()
            .map_err(|_| "PTY session state is poisoned".to_string())?;
        if sessions.contains_key(&opts.pane_id) {
            return Err(format!(
                "PTY session already exists for pane {}",
                opts.pane_id
            ));
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: opts.rows,
            cols: opts.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("failed to open PTY: {error}"))?;

    let launch_command = resolve_launch_command(&opts.command);
    let mut command = CommandBuilder::new(&launch_command);
    command.args(&opts.args);

    if let Some(cwd) = opts.cwd.as_deref() {
        command.cwd(normalize_cwd(cwd));
    }
    apply_environment(&mut command, &opts)?;

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to spawn {launch_command}: {error}"))?;
    drop(pair.slave);

    let mut reader = match pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(error) => {
            let _ = child.kill();
            return Err(format!("failed to clone PTY reader: {error}"));
        }
    };
    let writer = match pair.master.take_writer() {
        Ok(writer) => writer,
        Err(error) => {
            let _ = child.kill();
            return Err(format!("failed to take PTY writer: {error}"));
        }
    };

    let mut killer = child.clone_killer();
    let child = Arc::new(Mutex::new(child));
    let pane_id = opts.pane_id;

    {
        let mut sessions = manager
            .sessions
            .lock()
            .map_err(|_| "PTY session state is poisoned".to_string())?;
        if sessions.contains_key(&pane_id) {
            let _ = killer.kill();
            return Err(format!("PTY session already exists for pane {pane_id}"));
        }
        sessions.insert(
            pane_id.clone(),
            PtySession {
                child: Arc::clone(&child),
                master: pair.master,
                writer,
                killer,
            },
        );
    }

    let thread_pane_id = pane_id.clone();
    let thread_child = Arc::clone(&child);
    let reader_thread = thread::Builder::new()
        .name("helm-pty-reader".to_string())
        .spawn(move || {
            let mut buffer = [0_u8; READ_BUFFER_SIZE];

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => {
                        let _ = on_event.send(PtyEvent::Data {
                            bytes: buffer[..read].to_vec(),
                        });
                    }
                    Err(_) => break,
                }
            }

            let code = thread_child
                .lock()
                .ok()
                .and_then(|mut child| child.wait().ok())
                .map(|status| status.exit_code() as i32);
            let _ = on_event.send(PtyEvent::Exit { code });

            let state = app.state::<PtyManager>();
            let _ = remove_matching_session(&state, &thread_pane_id, &thread_child);
        });

    if let Err(error) = reader_thread {
        if let Some(mut session) = remove_matching_session(&manager, &pane_id, &child)? {
            let _ = session.killer.kill();
        }
        return Err(format!("failed to start PTY reader thread: {error}"));
    }

    Ok(())
}

#[tauri::command]
pub fn pty_write(
    manager: tauri::State<'_, PtyManager>,
    pane_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let session = sessions
        .get_mut(&pane_id)
        .ok_or_else(|| format!("no PTY session for pane {pane_id}"))?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| format!("failed to write to pane {pane_id}: {error}"))
}

#[tauri::command]
pub fn pty_resize(
    manager: tauri::State<'_, PtyManager>,
    pane_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let session = sessions
        .get(&pane_id)
        .ok_or_else(|| format!("no PTY session for pane {pane_id}"))?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("failed to resize pane {pane_id}: {error}"))
}

#[tauri::command]
pub fn pty_kill(
    manager: tauri::State<'_, PtyManager>,
    pane_id: String,
) -> Result<(), String> {
    let session = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?
        .remove(&pane_id);

    if let Some(mut session) = session {
        // A natural exit can race this command; killing an already-exited child is harmless.
        let _ = session.killer.kill();
    }

    Ok(())
}

fn remove_matching_session(
    manager: &PtyManager,
    pane_id: &str,
    child: &SharedChild,
) -> Result<Option<PtySession>, String> {
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let matches = sessions
        .get(pane_id)
        .map(|session| Arc::ptr_eq(&session.child, child))
        .unwrap_or(false);

    Ok(if matches {
        sessions.remove(pane_id)
    } else {
        None
    })
}

fn apply_environment(command: &mut CommandBuilder, opts: &PtySpawnOpts) -> Result<(), String> {
    // CommandBuilder inherits the host environment. Caller-provided values replace that base,
    // while helm's reserved variables remain invariant for every pane.
    for (key, value) in &opts.env {
        if !is_reserved_env_key(key) {
            command.env(key, value);
        }
    }

    let base_path = opts
        .env
        .iter()
        .find(|(key, _)| env_key_matches(key, "PATH"))
        .map(|(_, value)| OsString::from(value))
        .or_else(|| env::var_os("PATH"))
        .unwrap_or_default();
    let mut path_entries = vec![resolve_shim_dir()];
    path_entries.extend(env::split_paths(&base_path));
    let path = env::join_paths(path_entries)
        .map_err(|error| format!("failed to construct PTY PATH: {error}"))?;

    command.env("PATH", path);
    command.env("HELM", "1");
    command.env("HELM_PANE", &opts.pane_id);
    command.env("HELM_VERSION", env!("CARGO_PKG_VERSION"));
    Ok(())
}

fn is_reserved_env_key(key: &str) -> bool {
    ["PATH", "HELM", "HELM_PANE", "HELM_VERSION"]
        .iter()
        .any(|reserved| env_key_matches(key, reserved))
}

fn env_key_matches(actual: &str, expected: &str) -> bool {
    if cfg!(windows) {
        actual.eq_ignore_ascii_case(expected)
    } else {
        actual == expected
    }
}

fn resolve_shim_dir() -> PathBuf {
    if let Some(path) = env::var_os("HELM_SHIM_DIR").filter(|path| !path.is_empty()) {
        return PathBuf::from(path);
    }

    // In development CARGO_MANIFEST_DIR is src-tauri, so its sibling ../shim is stable
    // regardless of the process working directory. Packaged builds can set HELM_SHIM_DIR;
    // an executable-adjacent shim directory is also accepted as a packaging fallback.
    let dev_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("shim");
    if dev_path.is_dir() {
        return dev_path;
    }

    env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("shim")))
        .filter(|path| path.is_dir())
        .unwrap_or(dev_path)
}

fn resolve_launch_command(requested: &str) -> String {
    let requested = requested.trim();
    if !requested.is_empty() && !requested.eq_ignore_ascii_case("shell") {
        return requested.to_string();
    }

    #[cfg(windows)]
    {
        for candidate in ["pwsh.exe", "powershell.exe", "cmd.exe"] {
            if command_exists_on_path(candidate) {
                return candidate.to_string();
            }
        }
        "cmd.exe".to_string()
    }

    #[cfg(not(windows))]
    {
        env::var("SHELL")
            .ok()
            .filter(|shell| !shell.trim().is_empty())
            .unwrap_or_else(|| "bash".to_string())
    }
}

#[cfg(windows)]
fn command_exists_on_path(command: &str) -> bool {
    Path::new(command).is_file()
        || env::var_os("PATH")
            .map(|path| {
                env::split_paths(&path).any(|directory| directory.join(command).is_file())
            })
            .unwrap_or(false)
}

fn normalize_cwd(cwd: &str) -> OsString {
    let cwd = expand_home(cwd);

    #[cfg(windows)]
    {
        // ConPTY ultimately calls CreateProcessW, whose cwd handling is unreliable with '/'.
        OsString::from(cwd.to_string_lossy().replace('/', "\\"))
    }

    #[cfg(not(windows))]
    {
        cwd.into_os_string()
    }
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
