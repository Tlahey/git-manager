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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
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
