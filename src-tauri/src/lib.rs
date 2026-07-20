mod bridge;
mod fs;
mod proxy;
mod pty;
mod recorder;
mod search;
mod store;
mod sys;
mod voice;
mod worktree;

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pty::PtyManager::default())
        .manage(recorder::RecorderState::default())
        .setup(|app| {
            bridge::start(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_info,
            bridge::bridge_respond,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            fs::fs_read_dir,
            fs::fs_read_file,
            fs::fs_write_file,
            fs::fs_file_mtime,
            fs::image_read,
            fs::read_file_base64,
            search::search_project,
            store::helm_store_read,
            store::helm_store_write,
            store::helm_store_write_b64,
            store::helm_store_list,
            worktree::worktree_list,
            worktree::worktree_add,
            worktree::worktree_remove,
            recorder::recorder_append,
            recorder::recorder_read,
            proxy::proxy_http,
            voice::voice_transcribe,
            voice::voice_download_model,
            sys::env_info,
            sys::fs_exists,
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
