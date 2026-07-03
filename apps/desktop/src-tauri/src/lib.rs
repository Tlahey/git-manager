mod commands;
mod error;
mod models;
mod services;
mod state;
mod utils;

use commands::branch::{checkout_branch, create_branch, delete_branch, get_branches, get_tags};
use commands::github::{github_device_code, github_get_user, github_list_repos, github_poll_token};
use commands::submodule::list_submodules;
use commands::themes::get_user_themes;
use commands::fixup::{autosquash_preview, create_fixup_commit, get_pending_fixups, run_autosquash};
use commands::rollback::{get_commits_between, reset_to_commit, revert_commit};
use commands::commit::{
    create_commit, get_file_diff, get_staged_diff, stage_all, stage_file, unstage_all,
    unstage_file, discard_file_changes, get_file_raw_contents,
};
use commands::log::{get_commit_diff, get_commit_file, get_log};
use commands::ollama::{cancel_generation, check_ollama_status, generate_commit_message};
use commands::rebase::get_rebase_state;
use commands::remote::{add_remote, fetch_remote, get_remotes, pull_branch, push_branch, remove_remote};
use commands::repo::{
    get_repo_status, open_repo, scan_repos, clone_repo, init_repo, get_repo_summary,
    open_in_editor, get_repo_readme, open_in_terminal, get_terminal_commands,
};
use commands::ssh::{generate_ssh_key, read_ssh_public_key};
use commands::stash::{
    stash_push, stash_pop, stash_apply, stash_drop, stash_list, edit_stash_message, stash_store,
};
use commands::undo::{
    objects_exist, pin_object, recreate_branch_ref, restore_file_blob, restore_worktree_snapshot,
    snapshot_file, snapshot_worktree, snapshot_worktree_always, unpin_object,
};
use state::AppState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WindowEvent};

/// Builds the system tray icon (Show/Quit menu) and wires left-click-to-show. Pairs with the
/// `on_window_event` hook below: closing the window hides it instead of exiting, so the tray icon
/// is the only way back in (or out) once the window is closed — see
/// docs/architecture/17-notification-system-refactor-plan.md, Pattern 2.
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show git-manager", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide instead of quitting: keeps the webview (and the notification watcher's
            // polling loop) alive in the background, so OS notifications keep firing after the
            // user closes the window — the process only actually exits via the tray's "Quit".
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Repo
            open_repo,
            get_repo_status,
            scan_repos,
            clone_repo,
            init_repo,
            get_repo_summary,
            open_in_editor,
            get_repo_readme,
            open_in_terminal,
            get_terminal_commands,
            // Log / Graph
            get_log,
            get_commit_diff,
            get_commit_file,
            // Branches & Tags
            get_branches,
            get_tags,
            create_branch,
            checkout_branch,
            delete_branch,
            // Rebase
            get_rebase_state,
            // Ollama
            check_ollama_status,
            generate_commit_message,
            cancel_generation,
            // Working Tree
            stage_file,
            unstage_file,
            discard_file_changes,
            stage_all,
            unstage_all,
            create_commit,
            get_staged_diff,
            get_file_diff,
            get_file_raw_contents,
            // Remote
            fetch_remote,
            pull_branch,
            push_branch,
            get_remotes,
            add_remote,
            remove_remote,
            // Rollback
            revert_commit,
            reset_to_commit,
            get_commits_between,
            // Fixup
            create_fixup_commit,
            get_pending_fixups,
            autosquash_preview,
            run_autosquash,
            // Themes
            get_user_themes,
            // Submodules
            list_submodules,
            // GitHub OAuth
            github_device_code,
            github_poll_token,
            github_get_user,
            github_list_repos,
            // SSH
            generate_ssh_key,
            read_ssh_public_key,
            // Stash
            stash_push,
            stash_pop,
            stash_apply,
            stash_drop,
            stash_list,
            edit_stash_message,
            stash_store,
            // Undo/Redo
            snapshot_file,
            restore_file_blob,
            snapshot_worktree,
            snapshot_worktree_always,
            restore_worktree_snapshot,
            recreate_branch_ref,
            pin_object,
            unpin_object,
            objects_exist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
