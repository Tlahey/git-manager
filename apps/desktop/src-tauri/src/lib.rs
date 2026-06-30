mod commands;
mod error;
mod models;
mod state;

use commands::branch::{get_branches, get_tags};
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
use commands::remote::{fetch_remote, pull_branch, push_branch};
use commands::repo::{
    get_repo_status, open_repo, scan_repos, clone_repo, init_repo, get_repo_summary,
    open_in_editor, get_repo_readme, open_in_terminal, get_terminal_commands,
};
use commands::ssh::{generate_ssh_key, read_ssh_public_key};
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
