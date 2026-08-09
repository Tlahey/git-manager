use crate::error::AppError;
use crate::models::{
    Board, BoardCard, BoardCardPatch, BoardColumn, BoardTag, GitCommit, NewBoardCard, SprintSummary,
};
use crate::services::git_board;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Where the remote (GitHub-backed) board's structural config lives in a repo's working tree.
const BOARD_CONFIG_RELATIVE_PATH: &str = ".git-manager/board.json";

/// Where card attachments (pasted images, short screen recordings) are written, relative to the
/// repository root.
const BOARD_ATTACHMENTS_RELATIVE_DIR: &str = ".git-manager/attachments";

/// Refuses anything larger than this. Attachments live in the working tree and are meant to be
/// committed, so an unbounded write here would be an unbounded write into someone's repository
/// history. Large media belongs behind a link, not inside a card.
const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardWithCards {
    pub board: Board,
    pub cards: Vec<BoardCard>,
}

// ─── Local board (git-native) ─────────────────────────────────────────────

#[tauri::command]
pub async fn list_boards(path: String) -> Result<Vec<Board>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::list_boards(&repo)
}

#[tauri::command]
pub async fn get_board(path: String, board_id: String) -> Result<BoardWithCards, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let (board, cards) = git_board::get_board(&repo, &board_id)?;
    Ok(BoardWithCards { board, cards })
}

#[tauri::command]
pub async fn create_board(
    path: String,
    name: String,
    columns: Vec<BoardColumn>,
    dod_template: String,
    card_prefix: String,
    iteration: bool,
) -> Result<Board, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::create_board(
        &repo,
        &name,
        columns,
        &dod_template,
        &card_prefix,
        iteration,
    )
}

/// Board-level settings: name, tag palette, Definition-of-Done template. Separate from
/// `update_board_columns` because reordering columns is a different gesture from editing settings.
#[tauri::command]
pub async fn update_board_meta(
    path: String,
    board_id: String,
    name: String,
    tags: Vec<BoardTag>,
    dod_template: String,
    card_prefixes: Vec<String>,
    expected_revision: String,
) -> Result<Board, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::update_board_meta(
        &repo,
        &board_id,
        &name,
        tags,
        &dod_template,
        card_prefixes,
        &expected_revision,
    )
}

/// Closes a sprint with the statistics the frontend computed — see `git_board::close_board` for why
/// the summary is frozen rather than recomputed on read.
#[tauri::command]
pub async fn close_board(
    path: String,
    board_id: String,
    summary: SprintSummary,
    expected_revision: String,
) -> Result<Board, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::close_board(&repo, &board_id, summary, &expected_revision)
}

/// Carries cards from one board to another, preserving their identity — the sprint carry-over, and
/// the "move this ticket to another board" action. `to_column_id` is omitted by the former, which
/// wants each card's own column where the target board has it.
#[tauri::command]
pub async fn move_board_cards(
    path: String,
    from_board_id: String,
    to_board_id: String,
    card_ids: Vec<String>,
    to_column_id: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::move_cards_to_board(
        &repo,
        &from_board_id,
        &to_board_id,
        &card_ids,
        to_column_id.as_deref(),
    )
}

#[tauri::command]
pub async fn update_board_columns(
    path: String,
    board_id: String,
    columns: Vec<BoardColumn>,
    expected_revision: String,
) -> Result<Board, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::update_board_columns(&repo, &board_id, columns, &expected_revision)
}

/// `delete_cards` decides whether the board's tickets are erased with it or left restorable — see
/// `git_board::delete_board`.
#[tauri::command]
pub async fn delete_board(
    path: String,
    board_id: String,
    delete_cards: bool,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::delete_board(&repo, &board_id, delete_cards)
}

#[tauri::command]
/// `card` carries the new card's own identity — see `NewBoardCard`. `column_id` stays a separate
/// argument because it is the placement, not the card.
pub async fn create_board_card(
    path: String,
    board_id: String,
    column_id: String,
    card: NewBoardCard,
) -> Result<BoardCard, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::create_card(&repo, &board_id, &column_id, card)
}

#[tauri::command]
pub async fn update_board_card(
    path: String,
    board_id: String,
    card_id: String,
    patch: BoardCardPatch,
    expected_revision: String,
) -> Result<BoardCard, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::update_card(&repo, &board_id, &card_id, patch, &expected_revision)
}

/// A move is just a patch touching `columnId`/`order` — its own command because "move" and "edit
/// fields" are distinct gestures in the UI, even though they share `git_board::update_card`.
#[tauri::command]
pub async fn move_board_card(
    path: String,
    board_id: String,
    card_id: String,
    column_id: String,
    order: u32,
    expected_revision: String,
) -> Result<BoardCard, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let patch = BoardCardPatch {
        column_id: Some(column_id),
        order: Some(order),
        ..Default::default()
    };
    git_board::update_card(&repo, &board_id, &card_id, patch, &expected_revision)
}

/// Appends a comment to a card. The author is stamped in the service from the repo's git signature,
/// deliberately not passed in from the frontend.
#[tauri::command]
pub async fn add_board_card_comment(
    path: String,
    board_id: String,
    card_id: String,
    body: String,
    expected_revision: String,
) -> Result<BoardCard, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::add_card_comment(&repo, &board_id, &card_id, &body, &expected_revision)
}

#[tauri::command]
pub async fn delete_board_card(
    path: String,
    board_id: String,
    card_id: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::delete_card(&repo, &board_id, &card_id)
}

/// Deletes a whole set of cards at once — the archived-card purge. One commit for the set rather
/// than one per card, and all-or-nothing; see `git_board::delete_cards` for both reasons. Returns how
/// many were actually removed, which can be fewer than asked if one had already gone.
#[tauri::command]
pub async fn delete_board_cards(
    path: String,
    board_id: String,
    card_ids: Vec<String>,
) -> Result<usize, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::delete_cards(&repo, &board_id, &card_ids)
}

/// Archives (or un-archives) a whole set of cards at once — "archive this column", and the sprint
/// close's offer to put the finished work away. One commit for the set; see
/// `git_board::set_cards_archived`. Returns how many actually changed state.
#[tauri::command]
pub async fn set_board_cards_archived(
    path: String,
    board_id: String,
    card_ids: Vec<String>,
    archived: bool,
) -> Result<usize, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::set_cards_archived(&repo, &board_id, &card_ids, archived)
}

#[tauri::command]
pub async fn get_board_history(path: String, board_id: String) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::board_history(&repo, &board_id)
}

#[tauri::command]
pub async fn list_recoverable_boards(path: String) -> Result<Vec<Board>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::list_recoverable_boards(&repo)
}

#[tauri::command]
pub async fn restore_board_backup(path: String, board_id: String) -> Result<Board, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_board::restore_board_backup(&repo, &board_id)
}

// ─── Remote board config file (plain fs, no git2 — same carve-out as github.rs/ssh.rs/undo.rs) ────

/// Writes the remote board's structural config to `<repo>/.git-manager/board.json`. Plain filesystem
/// write, no staging: the user reviews and commits this file through the normal Source Control panel
/// like any other change, except when the board auto-sync setting periodically does it for them (see
/// `useBoardConfigAutoSync`). Deliberately scoped to this one fixed relative path rather than an
/// arbitrary caller-supplied one, to keep this command's surface minimal.
#[tauri::command]
pub async fn write_board_config(path: String, contents: String) -> Result<(), String> {
    let full_path = Path::new(&path).join(BOARD_CONFIG_RELATIVE_PATH);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(AppError::Io)?;
    }
    fs::write(&full_path, contents).map_err(AppError::Io)?;
    Ok(())
}

/// Saves a card attachment into `<repo>/.git-manager/attachments/` and returns its **repo-relative**
/// path, which the caller embeds in the card's markdown.
///
/// The filename is the content's own git blob hash (`Oid::hash_object`, no object is written), so
/// pasting the same screenshot into ten cards stores it once. The caller's `file_name` contributes
/// only its extension — an attacker-controlled name never reaches the filesystem, which keeps this
/// command free of path-traversal surface despite taking a name.
#[tauri::command]
pub async fn save_board_attachment(
    path: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err(AppError::Unknown("attachment is empty".to_string()).into());
    }
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::Unknown(format!(
            "attachment is larger than the {} MB limit",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        ))
        .into());
    }

    let extension = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| e.chars().all(|c| c.is_ascii_alphanumeric()) && e.len() <= 8)
        .unwrap_or_else(|| "bin".to_string());

    let oid = git2::Oid::hash_object(git2::ObjectType::Blob, &bytes).map_err(AppError::Git)?;
    let stored_name = format!("{}.{extension}", &oid.to_string()[..12]);

    let dir = Path::new(&path).join(BOARD_ATTACHMENTS_RELATIVE_DIR);
    fs::create_dir_all(&dir).map_err(AppError::Io)?;
    let full_path = dir.join(&stored_name);
    // Content-addressed, so an existing file with this name already holds these exact bytes.
    if !full_path.exists() {
        fs::write(&full_path, &bytes).map_err(AppError::Io)?;
    }

    Ok(format!("{BOARD_ATTACHMENTS_RELATIVE_DIR}/{stored_name}"))
}

/// Reads `.git-manager/board.json` from the working tree — the **working-tree** version, not a
/// committed blob, since a remote board being edited needs whatever is currently on disk (possibly
/// not yet committed). `None` if no remote board has been created in this repo yet.
#[tauri::command]
pub async fn read_board_config(path: String) -> Result<Option<String>, String> {
    let full_path = Path::new(&path).join(BOARD_CONFIG_RELATIVE_PATH);
    match fs::read_to_string(&full_path) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Io(e).into()),
    }
}
