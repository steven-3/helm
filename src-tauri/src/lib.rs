mod fs;
mod pty;
mod sys;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // This must run before Builder initializes GTK/WebKit. WSLg has no normal
    // DRM render node, so WebKitGTK's DMA-BUF probe can otherwise fall into the
    // noisy EGL/Zink failure path. The helper is deliberately WSL-only and
    // preserves any explicit user override.
    sys::configure_webkit_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(pty::PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            fs::fs_read_dir,
            fs::fs_read_file,
            fs::image_read,
            sys::env_info,
            sys::git_status,
            sys::git_stage,
            sys::git_unstage,
            sys::git_stage_all,
            sys::git_unstage_all,
            sys::git_commit,
            sys::git_diff,
            sys::git_branch_list,
            sys::git_checkout,
            sys::git_create_branch,
            sys::git_discard,
            sys::git_push,
            sys::git_pull,
            sys::git_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
