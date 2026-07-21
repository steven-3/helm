//! Voice-mode native surfaces: the OS-global toggle shortcut, the always-on-top
//! pop-out window, and Wispr-Flow-style external paste (clipboard + synthetic
//! Ctrl+V into whatever window the OS has focused).
//!
//! Contracts:
//! - `voice_global_shortcut_set(accelerator)` — (re)registers ONE global
//!   accelerator; a press emits `voice://global-toggle` to every window.
//!   Invalid accelerators and OS registration failures are `Err(String)`.
//!   Nothing is persisted here — the frontend owns the setting.
//! - `voice_popout_open` / `voice_popout_close` — create-or-focus / close the
//!   `voice-popout` WebviewWindow (360x120, always-on-top, undecorated,
//!   transparent, `index.html?window=voice-popout`).
//! - `paste_external(text)` — clipboard := text, then Ctrl+V into the focused
//!   window (Windows only). `Ok(true)` = keystroke sent, `Ok(false)` =
//!   clipboard-only (non-Windows).

use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Frontend contract: fired on every press of the registered accelerator.
const GLOBAL_TOGGLE_EVENT: &str = "voice://global-toggle";
const POPOUT_LABEL: &str = "voice-popout";

/// The single currently-registered voice accelerator. Tracked here (instead of
/// `unregister_all`) so future non-voice shortcuts can never be clobbered.
#[derive(Default)]
pub struct VoiceShortcutState(Mutex<Option<Shortcut>>);

/// Registers `accelerator` as the OS-global voice toggle, replacing any
/// previously registered one. Errors: unparsable accelerator, or the OS
/// refusing the registration (e.g. already taken by another app).
#[tauri::command]
pub fn voice_global_shortcut_set(
    app: tauri::AppHandle,
    state: tauri::State<'_, VoiceShortcutState>,
    accelerator: String,
) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|error| format!("invalid accelerator {accelerator:?}: {error}"))?;

    let mut current = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    // Clear the old registration first so re-binding the same keys works.
    if let Some(previous) = current.take() {
        let _ = app.global_shortcut().unregister(previous);
    }
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app.emit(GLOBAL_TOGGLE_EVENT, ());
            }
        })
        .map_err(|error| format!("failed to register {accelerator:?}: {error}"))?;
    *current = Some(shortcut);
    Ok(())
}

/// Unregisters the voice toggle shortcut. Idempotent — Ok when none is set.
#[tauri::command]
pub fn voice_global_shortcut_clear(
    app: tauri::AppHandle,
    state: tauri::State<'_, VoiceShortcutState>,
) -> Result<(), String> {
    let mut current = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    if let Some(previous) = current.take() {
        app.global_shortcut()
            .unregister(previous)
            .map_err(|error| format!("failed to unregister shortcut: {error}"))?;
    }
    Ok(())
}

/// Creates the voice pop-out window, or shows + focuses it when it already
/// exists. The frontend router reads `?window=voice-popout` to render the
/// pop-out surface instead of the cockpit.
#[tauri::command]
pub async fn voice_popout_open(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(POPOUT_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        window
            .set_focus()
            .map_err(|error| format!("failed to focus voice popout: {error}"))?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        POPOUT_LABEL,
        tauri::WebviewUrl::App("index.html?window=voice-popout".into()),
    )
    .title("Helm Voice")
    .inner_size(360.0, 120.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .build()
    .map_err(|error| format!("failed to open voice popout: {error}"))?;
    Ok(())
}

/// Closes the voice pop-out window. Idempotent — Ok when it does not exist.
#[tauri::command]
pub async fn voice_popout_close(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(POPOUT_LABEL) {
        window
            .close()
            .map_err(|error| format!("failed to close voice popout: {error}"))?;
    }
    Ok(())
}

/// Sets the system clipboard to `text`, then (Windows) synthesizes Ctrl+V into
/// the currently-focused OS window after a short settle delay. Returns whether
/// the keystroke was sent; on other platforms the clipboard is still set and
/// the result is `Ok(false)`. Timing relative to the target app gaining focus
/// is the caller's responsibility.
#[tauri::command]
pub async fn paste_external(app: tauri::AppHandle, text: String) -> Result<bool, String> {
    app.clipboard()
        .write_text(text)
        .map_err(|error| format!("failed to set clipboard: {error}"))?;

    #[cfg(target_os = "windows")]
    {
        // Let focus settle (e.g. the user just clicked into the target app).
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        tauri::async_runtime::spawn_blocking(send_ctrl_v)
            .await
            .map_err(|error| format!("paste task failed: {error}"))??;
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

/// Synthesizes a Ctrl+V chord via `SendInput` as one atomic batch (down/down/
/// up/up), so no other injected input can interleave inside the chord.
#[cfg(target_os = "windows")]
fn send_ctrl_v() -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
    };

    fn key(vk: u16, flags: u32) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    let inputs = [
        key(VK_CONTROL, 0),
        key(VK_V, 0),
        key(VK_V, KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        // Partial/zero injection: blocked by UIPI (elevated target) or a
        // secure desktop (UAC prompt, lock screen).
        Err("keystroke injection was blocked by the focused window".to_string())
    }
}
