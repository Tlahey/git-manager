mod commands;
mod error;
mod models;
mod services;
mod state;
mod utils;

use commands::agent::get_worktree_agent_activity;
use commands::ai::{
    ai_complete, ai_generate_stream, cancel_generation, check_ai_status, get_ai_activity,
    get_ai_context,
};
use commands::blame::{get_file_history, git_blame_file};
use commands::branch::{
    checkout_branch, create_branch, create_tag, delete_branch, delete_tag, fast_forward_branch,
    get_branches, get_tag_containing_commit, get_tags, is_commit_on_current_branch, merge_branch,
};
use commands::cherry_pick::cherry_pick_commit;
use commands::commit::{
    create_commit, discard_file_changes, get_commit_file_vs_workdir, get_file_diff,
    get_file_raw_contents, get_staged_diff, stage_all, stage_file, unstage_all, unstage_file,
};
use commands::conflict::{
    auto_merge_conflict_view, get_merge_view, list_conflicted_files, resolve_conflict,
    resolve_conflict_binary,
};
use commands::fixup::{
    autosquash_preview, check_fixup_target, create_fixup_commit, get_pending_fixups, run_autosquash,
};
use commands::github::{
    get_pr_template, github_commit_avatars, github_device_code, github_get_user, github_list_repos,
    github_poll_token,
};
use commands::interactive_rebase::{list_rebase_commits, run_interactive_rebase};
use commands::log::{compare_commit_to_workdir, get_commit_diff, get_commit_file, get_log};
use commands::patch::{
    apply_patch, commit_dependency_patch, create_patch, create_working_patch,
    list_patchable_dependencies, prepare_dependency_patch, preview_working_patch, read_patch_file,
};
use commands::rebase::{
    abort_rebase, continue_rebase, get_rebase_state, rebase_onto_commit, skip_rebase,
};
use commands::remote::{
    add_remote, fetch_remote, get_commit_web_url, get_remotes, pull_branch, push_branch,
    push_branch_to, remove_remote,
};
use commands::repo::{
    clone_repo, get_repo_readme, get_repo_status, get_repo_summary, get_terminal_commands,
    init_repo, open_in_editor, open_in_terminal, open_repo, scan_repos,
};
use commands::rollback::{get_commits_between, reset_to_commit, revert_commit};
use commands::ssh::{generate_ssh_key, read_ssh_public_key};
use commands::stash::{
    edit_stash_message, stash_apply, stash_drop, stash_list, stash_pop, stash_push, stash_store,
};
use commands::submodule::list_submodules;
use commands::tasks::{get_project_commands, run_task_in_terminal};
use commands::themes::get_user_themes;
use commands::undo::{
    objects_exist, pin_object, recreate_branch_ref, restore_file_blob, restore_worktree_snapshot,
    snapshot_file, snapshot_worktree, snapshot_worktree_always, unpin_object,
};
use commands::worktree::{
    add_worktree, count_default_file_matches, gone_upstream_branches, list_worktrees,
    prune_worktrees, remove_worktree,
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
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // Embedded WebDriver server for WebdriverIO e2e tests (see apps/desktop/e2e/). Only
    // compiled in when built with `--features e2e`; never present in a normal dev or
    // release build, so it's never a local attack surface for real users.
    #[cfg(feature = "e2e")]
    {
        builder = builder
            .plugin(tauri_plugin_wdio::init())
            .plugin(tauri_plugin_wdio_webdriver::init());
    }

    builder = builder.manage(AppState::new());

    builder
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide instead of quitting: keeps the webview (and the notification watcher's
            // polling loop) alive in the background, so OS notifications keep firing after the
            // user closes the window — the process only actually exits via the tray's "Quit".
            // Only apply this to the main window; dedicated sub-windows should close normally.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
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
            // Tasks
            run_task_in_terminal,
            get_project_commands,
            // Log / Graph
            get_log,
            get_commit_diff,
            get_commit_file,
            compare_commit_to_workdir,
            // Blame / File history
            git_blame_file,
            get_file_history,
            // Branches & Tags
            get_branches,
            get_tags,
            create_branch,
            create_tag,
            checkout_branch,
            delete_branch,
            delete_tag,
            get_tag_containing_commit,
            is_commit_on_current_branch,
            merge_branch,
            fast_forward_branch,
            // Rebase
            get_rebase_state,
            rebase_onto_commit,
            continue_rebase,
            abort_rebase,
            skip_rebase,
            list_rebase_commits,
            run_interactive_rebase,
            // AI
            check_ai_status,
            get_ai_context,
            get_ai_activity,
            ai_generate_stream,
            ai_complete,
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
            get_commit_file_vs_workdir,
            // Remote
            fetch_remote,
            pull_branch,
            push_branch,
            push_branch_to,
            get_remotes,
            add_remote,
            remove_remote,
            get_commit_web_url,
            // Rollback
            revert_commit,
            reset_to_commit,
            get_commits_between,
            // Cherry-pick
            cherry_pick_commit,
            // Fixup
            create_fixup_commit,
            check_fixup_target,
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
            github_commit_avatars,
            get_pr_template,
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
            // Worktree
            add_worktree,
            count_default_file_matches,
            list_worktrees,
            remove_worktree,
            prune_worktrees,
            gone_upstream_branches,
            // Agent activity
            get_worktree_agent_activity,
            // Patch
            create_patch,
            create_working_patch,
            preview_working_patch,
            read_patch_file,
            apply_patch,
            list_patchable_dependencies,
            prepare_dependency_patch,
            commit_dependency_patch,
            // Conflict resolution
            list_conflicted_files,
            get_merge_view,
            resolve_conflict,
            resolve_conflict_binary,
            auto_merge_conflict_view,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
