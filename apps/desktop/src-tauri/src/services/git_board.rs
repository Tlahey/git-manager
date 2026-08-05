//! Local, git-native Kanban board storage (issue #259) — one hidden ref per board holding an
//! append-only history of full-state commits, following the same "custom ref outside normal git
//! operations" pattern as `commands/undo.rs` (`PIN_NAMESPACE`/`pin_oid`/`repo.blob`/`TreeBuilder`).
//! Deliberately **not** a git-bug-style CRDT operation log: this store is local-only and never
//! pushed, so there is no concurrent-writer/merge scenario to design for — a linear history of full
//! snapshots is enough to get "every change is a commit" for free.
//!
//! Ref layout: `refs/git-manager/board/<board-id>/state` points at the latest state commit. Its tree:
//! ```text
//! board.json           — serialized Board (name, columns, tag palette, DOD template, sprint
//!                        closing state, schemaVersion, timestamps)
//! cards/<card-id>.json — one blob per card
//! ```
//!
//! Sprint closing (`close_board`) stores the summary the frontend computed rather than recomputing
//! it on read, because closing normally *moves* the unfinished cards to a successor board via
//! `move_cards_to_board` — a later recomputation would report a sprint that went better than it did.
//! Every mutation reads the ref's current tree, rewrites it via `TreeBuilder`, and writes a new
//! commit with the previous tip as parent — `repo.commit`'s `update_ref` argument is left `None` (the
//! commit object is written without moving any ref, proven safe against arbitrary target refs by the
//! `ai_activity.rs` test fixture, which already commits to a non-`HEAD` ref) and the ref is then moved
//! explicitly, so the caller controls whether that move is a plain create or a compare-and-swap.
//!
//! Concurrency: a `Board`/`BoardCard`'s `revision` field is simply the board ref's tip commit oid at
//! read time — a whole-board version stamp, not something tracked per card. `update_card` and
//! `update_board_columns` take the caller's last-seen `revision` and move the ref via
//! `Repository::reference_matching` (libgit2's compare-and-swap primitive) instead of a force update;
//! a mismatch surfaces as `AppError::BoardConflict` (mapped from `GIT_EMODIFIED`) rather than silently
//! overwriting a write that landed in between.
//!
//! Backup: every mutation also mirrors the resulting board+cards to
//! `~/.git-manager/boards/<repo-slug>/<board-id>.json` (see `sync_backup`) — a disaster-recovery cache
//! for the case the whole repository is deleted and re-cloned. The ref above lives in the repo's
//! *shared* `.git` object/ref store, so it survives removing a linked `git worktree`; it does **not**
//! survive deleting/re-cloning the repository itself, which is exactly the gap this mirror covers.
//! `delete_board` removes the mirror too — an intentional deletion must not resurrect the board via
//! the "recoverable board" restore flow, which exists for accidental loss, not as an undo for this.

use crate::error::AppError;
use crate::models::{
    Board, BoardCard, BoardCardPatch, BoardColumn, BoardComment, BoardTag, GitCommit, NewBoardCard,
    SprintSummary, LOCAL_BOARD_SOURCE,
};
use crate::utils::{commit_to_model, get_git_signature, repo_slug};
use chrono::Utc;
use git2::{ErrorCode, Oid, Repository, Tree};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::BTreeMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

const BOARD_NAMESPACE: &str = "refs/git-manager/board/";
const BOARD_JSON: &str = "board.json";
const CARDS_DIR: &str = "cards";
/// Bumped to 2 when cards gained assignee/priority/due date/tags/blocking/DOD/comments. Every one of
/// those fields is `#[serde(default)]`, so a v1 blob still deserializes — the version is a marker for
/// readers, not a gate.
const SCHEMA_VERSION: u32 = 2;

fn board_ref_name(board_id: &str) -> String {
    format!("{BOARD_NAMESPACE}{board_id}/state")
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Short, label-safe id generation shared by boards and cards. No `uuid`/`rand` crate exists in this
/// workspace, so this reuses the same seed-and-hash technique as `utils::repo_slug`, keyed by a
/// caller-supplied seed plus a nanosecond timestamp instead of a repo path.
fn generate_id(seed: &str) -> String {
    let nanos = Utc::now().timestamp_nanos_opt().unwrap_or_default();
    let mut hasher = DefaultHasher::new();
    format!("{seed}-{nanos}").hash(&mut hasher);
    format!("{:x}", hasher.finish() & 0xffff_ffff)
}

// ─── Reading ───────────────────────────────────────────────────────────────

/// Resolves a board's current state commit, or `None` if no board with that id exists.
fn read_state<'repo>(
    repo: &'repo Repository,
    board_id: &str,
) -> Result<Option<git2::Commit<'repo>>, String> {
    match repo.find_reference(&board_ref_name(board_id)) {
        Ok(reference) => Ok(Some(reference.peel_to_commit().map_err(AppError::Git)?)),
        Err(e) if e.code() == ErrorCode::NotFound => Ok(None),
        Err(e) => Err(String::from(AppError::Git(e))),
    }
}

fn read_board_json(repo: &Repository, tree: &Tree) -> Result<Board, String> {
    let entry = tree.get_name(BOARD_JSON).ok_or_else(|| {
        String::from(AppError::Unknown(
            "board.json missing from board state tree".to_string(),
        ))
    })?;
    let blob = repo.find_blob(entry.id()).map_err(AppError::Git)?;
    let mut board: Board = serde_json::from_slice(blob.content())
        .map_err(|e| String::from(AppError::Unknown(format!("corrupt board.json: {e}"))))?;
    migrate_prefixes(&mut board);
    Ok(board)
}

/// Folds a board written with one prefix and one counter into the per-prefix form.
///
/// Done on read rather than by rewriting every board once: a migration pass would have to run
/// somewhere, at some moment, and get every board including ones in repositories not currently
/// open. Reading is the only moment every board reliably passes through. The legacy fields stop
/// being written the first time the board is saved, so this converges without a migration step.
fn migrate_prefixes(board: &mut Board) {
    if !board.card_prefixes.is_empty() || board.card_prefix.is_empty() {
        return;
    }
    let legacy = std::mem::take(&mut board.card_prefix);
    let next = board.next_card_number.take().unwrap_or(1);
    board.next_card_numbers.insert(legacy.clone(), next);
    board.card_prefixes.push(legacy);
}

fn read_cards(repo: &Repository, tree: &Tree) -> Result<Vec<BoardCard>, String> {
    let Some(cards_entry) = tree.get_name(CARDS_DIR) else {
        return Ok(Vec::new());
    };
    let cards_tree = repo.find_tree(cards_entry.id()).map_err(AppError::Git)?;
    let mut cards = Vec::with_capacity(cards_tree.len());
    for entry in cards_tree.iter() {
        let blob = repo.find_blob(entry.id()).map_err(AppError::Git)?;
        let card: BoardCard = serde_json::from_slice(blob.content())
            .map_err(|e| String::from(AppError::Unknown(format!("corrupt card blob: {e}"))))?;
        cards.push(card);
    }
    cards.sort_by(|a, b| a.column_id.cmp(&b.column_id).then(a.order.cmp(&b.order)));
    Ok(cards)
}

/// Lists every local board in the repo, newest-name-first ordering left to the caller — sorted here
/// by name for a stable UI order.
pub fn list_boards(repo: &Repository) -> Result<Vec<Board>, String> {
    let refs = repo
        .references_glob(&format!("{BOARD_NAMESPACE}*/state"))
        .map_err(AppError::Git)?;
    let mut boards = Vec::new();
    for reference in refs {
        let reference = reference.map_err(AppError::Git)?;
        let commit = reference.peel_to_commit().map_err(AppError::Git)?;
        let tree = commit.tree().map_err(AppError::Git)?;
        let mut board = read_board_json(repo, &tree)?;
        board.revision = commit.id().to_string();
        boards.push(board);
    }
    boards.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(boards)
}

pub fn get_board(repo: &Repository, board_id: &str) -> Result<(Board, Vec<BoardCard>), String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut board = read_board_json(repo, &tree)?;
    board.revision = tip.id().to_string();

    let mut cards = read_cards(repo, &tree)?;
    for card in &mut cards {
        card.revision = tip.id().to_string();
    }
    Ok((board, cards))
}

// ─── Tree building ─────────────────────────────────────────────────────────

fn insert_board_json(
    repo: &Repository,
    tb: &mut git2::TreeBuilder,
    board: &Board,
) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(board).expect("Board always serializes");
    let blob_oid = repo.blob(&bytes).map_err(AppError::Git)?;
    tb.insert(BOARD_JSON, blob_oid, 0o100644)
        .map_err(AppError::Git)?;
    Ok(())
}

fn write_board_json(repo: &Repository, base_tree: &Tree, board: &Board) -> Result<Oid, String> {
    let mut tb = repo.treebuilder(Some(base_tree)).map_err(AppError::Git)?;
    insert_board_json(repo, &mut tb, board)?;
    tb.write().map_err(AppError::Git).map_err(String::from)
}

/// Adds/updates one card's blob under `cards/` and returns the new root tree oid.
fn write_card_blob(repo: &Repository, base_tree: &Tree, card: &BoardCard) -> Result<Oid, String> {
    let cards_subtree = base_tree
        .get_name(CARDS_DIR)
        .map(|entry| repo.find_tree(entry.id()))
        .transpose()
        .map_err(AppError::Git)?;

    let mut cards_tb = repo
        .treebuilder(cards_subtree.as_ref())
        .map_err(AppError::Git)?;
    let bytes = serde_json::to_vec_pretty(card).expect("BoardCard always serializes");
    let blob_oid = repo.blob(&bytes).map_err(AppError::Git)?;
    cards_tb
        .insert(format!("{}.json", card.id), blob_oid, 0o100644)
        .map_err(AppError::Git)?;
    let cards_tree_oid = cards_tb.write().map_err(AppError::Git)?;

    let mut root_tb = repo.treebuilder(Some(base_tree)).map_err(AppError::Git)?;
    root_tb
        .insert(CARDS_DIR, cards_tree_oid, 0o040000)
        .map_err(AppError::Git)?;
    root_tb.write().map_err(AppError::Git).map_err(String::from)
}

/// Removes one card's blob from under `cards/` and returns the new root tree oid. Errors with
/// `CardNotFound` if no `cards/` dir exists yet, or the card id isn't in it.
fn remove_card_blob(repo: &Repository, base_tree: &Tree, card_id: &str) -> Result<Oid, String> {
    let cards_entry = base_tree
        .get_name(CARDS_DIR)
        .ok_or_else(|| String::from(AppError::CardNotFound(card_id.to_string())))?;
    let cards_subtree = repo.find_tree(cards_entry.id()).map_err(AppError::Git)?;
    let mut cards_tb = repo
        .treebuilder(Some(&cards_subtree))
        .map_err(AppError::Git)?;

    let filename = format!("{card_id}.json");
    if cards_tb.get(&filename).map_err(AppError::Git)?.is_none() {
        return Err(String::from(AppError::CardNotFound(card_id.to_string())));
    }
    cards_tb.remove(&filename).map_err(AppError::Git)?;
    let cards_tree_oid = cards_tb.write().map_err(AppError::Git)?;

    let mut root_tb = repo.treebuilder(Some(base_tree)).map_err(AppError::Git)?;
    root_tb
        .insert(CARDS_DIR, cards_tree_oid, 0o040000)
        .map_err(AppError::Git)?;
    root_tb.write().map_err(AppError::Git).map_err(String::from)
}

fn apply_card_patch(card: &mut BoardCard, patch: BoardCardPatch) {
    if let Some(title) = patch.title {
        card.title = title;
    }
    if let Some(description) = patch.description {
        card.description = description;
    }
    if let Some(column_id) = patch.column_id {
        card.column_id = column_id;
    }
    if let Some(order) = patch.order {
        card.order = order;
    }
    if let Some(linked_branch) = patch.linked_branch {
        card.linked_branch = linked_branch;
    }
    if let Some(assignee) = patch.assignee {
        card.assignee = assignee;
    }
    if let Some(priority) = patch.priority {
        card.priority = priority;
    }
    if let Some(due_date) = patch.due_date {
        card.due_date = due_date;
    }
    if let Some(tag_ids) = patch.tag_ids {
        card.tag_ids = tag_ids;
    }
    if let Some(blocked_reason) = patch.blocked_reason {
        // An empty reason means "not blocked": the reason's presence *is* the blocked flag, so a
        // cleared textbox has to unset it rather than leave the card blocked for no stated reason.
        card.blocked_reason = blocked_reason.filter(|r| !r.trim().is_empty());
    }
    if let Some(dod) = patch.dod {
        card.dod = dod;
    }
    if let Some(archived_at) = patch.archived_at {
        card.archived_at = archived_at;
    }
    if let Some(source_issue) = patch.source_issue {
        card.source_issue = source_issue;
    }
    if let Some(kind) = patch.kind {
        card.kind = kind;
    }
    if let Some(links) = patch.links {
        card.links = links;
    }
}

// ─── Committing ────────────────────────────────────────────────────────────

/// Writes `tree_oid` as the board's very first state commit and creates its ref. Fails with
/// `BoardAlreadyExists` if the ref is already taken (a `create_board` id collision, or restoring a
/// backup for a board that already has a live ref).
fn commit_state_create(
    repo: &Repository,
    board_id: &str,
    tree_oid: Oid,
    message: &str,
) -> Result<Oid, String> {
    let sig = get_git_signature(repo)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;
    let new_oid = repo
        .commit(None, &sig, &sig, message, &tree, &[])
        .map_err(AppError::Git)?;
    repo.reference(&board_ref_name(board_id), new_oid, false, message)
        .map_err(|e| {
            if e.code() == ErrorCode::Exists {
                String::from(AppError::BoardAlreadyExists(board_id.to_string()))
            } else {
                String::from(AppError::Git(e))
            }
        })?;
    Ok(new_oid)
}

/// Writes `tree_oid` as a new state commit whose parent is `parent`, then moves the board's ref from
/// `expected_oid` to the new commit via `reference_matching` — libgit2's compare-and-swap primitive.
/// Returns `BoardConflict` (mapped from `GIT_EMODIFIED`) if the ref no longer matches `expected_oid`.
fn commit_state_cas(
    repo: &Repository,
    board_id: &str,
    parent: &git2::Commit,
    expected_oid: Oid,
    tree_oid: Oid,
    message: &str,
) -> Result<Oid, String> {
    let sig = get_git_signature(repo)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;
    let new_oid = repo
        .commit(None, &sig, &sig, message, &tree, &[parent])
        .map_err(AppError::Git)?;
    repo.reference_matching(
        &board_ref_name(board_id),
        new_oid,
        true,
        expected_oid,
        message,
    )
    .map_err(|e| {
        if e.code() == ErrorCode::Modified {
            String::from(AppError::BoardConflict(board_id.to_string()))
        } else {
            String::from(AppError::Git(e))
        }
    })?;
    Ok(new_oid)
}

// ─── Public mutations ──────────────────────────────────────────────────────

pub fn create_board(
    repo: &Repository,
    name: &str,
    columns: Vec<BoardColumn>,
    dod_template: &str,
    card_prefix: &str,
) -> Result<Board, String> {
    let board_id = generate_id(name);
    let now = now_iso();
    let mut board = Board {
        id: board_id.clone(),
        name: name.to_string(),
        source: LOCAL_BOARD_SOURCE.to_string(),
        revision: String::new(),
        columns,
        tags: Vec::new(),
        // The legacy pair is left empty on a new board: it exists only to migrate old ones.
        card_prefix: String::new(),
        next_card_number: None,
        // A board can start with one suggested prefix, but a card is free to add another.
        card_prefixes: match card_prefix.trim().to_uppercase() {
            p if p.is_empty() => Vec::new(),
            p => vec![p],
        },
        next_card_numbers: BTreeMap::new(),
        dod_template: dod_template.to_string(),
        closed_at: None,
        summary: None,
        schema_version: SCHEMA_VERSION,
        created_at: now.clone(),
        updated_at: now,
    };

    let mut tb = repo.treebuilder(None).map_err(AppError::Git)?;
    insert_board_json(repo, &mut tb, &board)?;
    let tree_oid = tb.write().map_err(AppError::Git)?;

    let new_oid = commit_state_create(repo, &board_id, tree_oid, "git-manager: create board")?;
    board.revision = new_oid.to_string();

    sync_backup(repo, &board_id);
    Ok(board)
}

/// Replaces the board's columns, re-homing any card whose column just disappeared.
///
/// **Every card has to sit in a column that exists.** The board renders a card only into one of its
/// own columns (`BoardColumnsArea`'s `cardsByColumn`), so a card left behind in a removed column
/// would be invisible: off the board, absent from the archive dialog — which lists archived cards,
/// not orphaned ones — and not reachable by searching either, while still holding its identifier and
/// its number. Re-homing them into the first remaining column, **in the same commit as the column
/// change**, is the same rule `move_cards_to_board` already applies when a card arrives on a board
/// that has no column by its id; doing it in one commit is what keeps the invariant true of every
/// state the ref ever holds.
pub fn update_board_columns(
    repo: &Repository,
    board_id: &str,
    columns: Vec<BoardColumn>,
    expected_revision: &str,
) -> Result<Board, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let expected_oid = Oid::from_str(expected_revision).map_err(AppError::Git)?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut board = read_board_json(repo, &tree)?;
    board.columns = columns;
    board.updated_at = now_iso();

    let mut new_tree_oid = write_board_json(repo, &tree, &board)?;
    // `None` only when the board was left with no column at all, which the editor refuses to save;
    // there is then nowhere to re-home anything to, and the cards are better left where they are.
    if let Some(fallback) = board
        .columns
        .iter()
        .min_by_key(|c| c.order)
        .map(|c| c.id.clone())
    {
        for mut card in read_cards(repo, &tree)? {
            if board.columns.iter().any(|c| c.id == card.column_id) {
                continue;
            }
            card.column_id = fallback.clone();
            card.updated_at = now_iso();
            let base = repo.find_tree(new_tree_oid).map_err(AppError::Git)?;
            new_tree_oid = write_card_blob(repo, &base, &card)?;
        }
    }

    let new_oid = commit_state_cas(
        repo,
        board_id,
        &tip,
        expected_oid,
        new_tree_oid,
        "git-manager: update board columns",
    )?;
    board.revision = new_oid.to_string();

    sync_backup(repo, board_id);
    Ok(board)
}

pub fn delete_board(repo: &Repository, board_id: &str) -> Result<(), String> {
    if let Ok(mut reference) = repo.find_reference(&board_ref_name(board_id)) {
        reference.delete().map_err(AppError::Git)?;
    }
    remove_backup(repo, board_id);
    Ok(())
}

/// Creates a card, optionally tracking a GitHub issue from the outset.
///
/// `source_issue` is taken here rather than left to a follow-up patch so that a tracked card is
/// never briefly an untracked one: the link lands in the same commit as the card, like the
/// identifier counter below.
pub fn create_card(
    repo: &Repository,
    board_id: &str,
    column_id: &str,
    new: NewBoardCard,
) -> Result<BoardCard, String> {
    let NewBoardCard {
        title,
        description,
        prefix,
        kind,
        source_issue,
    } = new;
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let next_order = read_cards(repo, &tree)?
        .iter()
        .filter(|c| c.column_id == column_id)
        .map(|c| c.order)
        .max()
        .map_or(0, |m| m + 1);

    // The board's Definition-of-Done template is *materialized* into the card here rather than
    // referenced, so editing the template later never rewrites the checklists of cards already in
    // flight — and each card's copy is freely editable, which is the whole point of the template.
    let mut board = read_board_json(repo, &tree)?;
    let dod = board.dod_template.clone();

    // The identifier is taken from the counter for *this prefix* and the counter is advanced in the
    // same commit as the card below, so a number is never handed out twice and never reused after a
    // delete — `max(existing) + 1` would do both. A prefix seen for the first time is added to the
    // board's list here, which is what "you can add one at creation" means at the storage level.
    let number = if prefix.is_empty() {
        0
    } else {
        let counter = board.next_card_numbers.entry(prefix.clone()).or_insert(1);
        let allocated = *counter;
        *counter = allocated + 1;
        if !board.card_prefixes.contains(&prefix) {
            board.card_prefixes.push(prefix.clone());
        }
        allocated
    };
    board.updated_at = now_iso();

    let mut card = BoardCard {
        id: generate_id(&title),
        board_id: board_id.to_string(),
        column_id: column_id.to_string(),
        title,
        description,
        order: next_order,
        linked_branch: None,
        revision: String::new(),
        prefix,
        number,
        kind,
        links: Vec::new(),
        source_issue,
        assignee: None,
        priority: "normal".to_string(),
        due_date: None,
        tag_ids: Vec::new(),
        blocked_reason: None,
        dod,
        comments: Vec::new(),
        archived_at: None,
        schema_version: SCHEMA_VERSION,
        updated_at: now_iso(),
    };

    // Both writes land in one tree, so the card and the advanced counter share a commit — there is
    // no window in which a number exists on a card the board doesn't know it gave out.
    let with_card = write_card_blob(repo, &tree, &card)?;
    let with_card_tree = repo.find_tree(with_card).map_err(AppError::Git)?;
    let new_tree_oid = write_board_json(repo, &with_card_tree, &board)?;

    let new_oid = commit_state_cas(
        repo,
        board_id,
        &tip,
        tip.id(),
        new_tree_oid,
        "git-manager: create board card",
    )?;
    card.revision = new_oid.to_string();

    sync_backup(repo, board_id);
    Ok(card)
}

/// Applies a patch to one card — a `move_card` is just a patch touching `columnId`/`order`, so the
/// `move_board_card` command calls straight through to this.
pub fn update_card(
    repo: &Repository,
    board_id: &str,
    card_id: &str,
    patch: BoardCardPatch,
    expected_revision: &str,
) -> Result<BoardCard, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let expected_oid = Oid::from_str(expected_revision).map_err(AppError::Git)?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut cards = read_cards(repo, &tree)?;
    let idx = cards
        .iter()
        .position(|c| c.id == card_id)
        .ok_or_else(|| String::from(AppError::CardNotFound(card_id.to_string())))?;
    apply_card_patch(&mut cards[idx], patch);
    cards[idx].updated_at = now_iso();

    let new_tree_oid = write_card_blob(repo, &tree, &cards[idx])?;
    let new_oid = commit_state_cas(
        repo,
        board_id,
        &tip,
        expected_oid,
        new_tree_oid,
        "git-manager: update board card",
    )?;

    let mut updated = cards.swap_remove(idx);
    updated.revision = new_oid.to_string();

    sync_backup(repo, board_id);
    Ok(updated)
}

/// Appends a comment to a card. The author is taken from the repository's own git signature rather
/// than from the caller: a comment records who the repo says is committing, which the frontend has
/// no business asserting.
pub fn add_card_comment(
    repo: &Repository,
    board_id: &str,
    card_id: &str,
    body: &str,
    expected_revision: &str,
) -> Result<BoardCard, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let expected_oid = Oid::from_str(expected_revision).map_err(AppError::Git)?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut cards = read_cards(repo, &tree)?;
    let idx = cards
        .iter()
        .position(|c| c.id == card_id)
        .ok_or_else(|| String::from(AppError::CardNotFound(card_id.to_string())))?;

    let signature = get_git_signature(repo)?;
    let author = signature.name().unwrap_or("unknown").to_string();
    let now = now_iso();
    cards[idx].comments.push(BoardComment {
        id: generate_id(card_id),
        author,
        body: body.to_string(),
        created_at: now.clone(),
    });
    cards[idx].updated_at = now;

    let new_tree_oid = write_card_blob(repo, &tree, &cards[idx])?;
    let new_oid = commit_state_cas(
        repo,
        board_id,
        &tip,
        expected_oid,
        new_tree_oid,
        "git-manager: comment on board card",
    )?;

    let mut updated = cards.swap_remove(idx);
    updated.revision = new_oid.to_string();

    sync_backup(repo, board_id);
    Ok(updated)
}

/// Updates the board's own metadata — name, tag palette, Definition-of-Done template. Columns have
/// their own entry point (`update_board_columns`) because reordering columns is a different gesture
/// from editing the board's settings, even though both rewrite `board.json`.
pub fn update_board_meta(
    repo: &Repository,
    board_id: &str,
    name: &str,
    tags: Vec<BoardTag>,
    dod_template: &str,
    card_prefixes: Vec<String>,
    expected_revision: &str,
) -> Result<Board, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let expected_oid = Oid::from_str(expected_revision).map_err(AppError::Git)?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut board = read_board_json(repo, &tree)?;
    board.name = name.to_string();
    board.tags = tags;
    board.dod_template = dod_template.to_string();
    // The prefixes a card may be created with. Editing this list never touches a card: a card holds
    // its own prefix, so removing one here only stops it being *offered* — every `GM-7` already out
    // there stays `GM-7`. The counters are left alone for the same reason; re-adding a removed
    // prefix must not restart its sequence at 1 on top of cards that already exist.
    board.card_prefixes = card_prefixes
        .into_iter()
        .map(|p| p.trim().to_uppercase())
        .filter(|p| !p.is_empty())
        .fold(Vec::new(), |mut acc, p| {
            if !acc.contains(&p) {
                acc.push(p);
            }
            acc
        });
    board.updated_at = now_iso();

    let new_tree_oid = write_board_json(repo, &tree, &board)?;
    let new_oid = commit_state_cas(
        repo,
        board_id,
        &tip,
        expected_oid,
        new_tree_oid,
        "git-manager: update board settings",
    )?;
    board.revision = new_oid.to_string();

    sync_backup(repo, board_id);
    Ok(board)
}

/// Closes a sprint: stamps `closed_at` and freezes the summary the frontend computed. The summary is
/// stored rather than recomputed on read because closing usually *moves* the unfinished cards to a
/// successor board — a later recomputation would report a sprint that went better than it did.
pub fn close_board(
    repo: &Repository,
    board_id: &str,
    summary: SprintSummary,
    expected_revision: &str,
) -> Result<Board, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let expected_oid = Oid::from_str(expected_revision).map_err(AppError::Git)?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut board = read_board_json(repo, &tree)?;
    board.closed_at = Some(summary.closed_at.clone());
    board.summary = Some(summary);
    board.updated_at = now_iso();

    let new_tree_oid = write_board_json(repo, &tree, &board)?;
    let new_oid = commit_state_cas(
        repo,
        board_id,
        &tip,
        expected_oid,
        new_tree_oid,
        "git-manager: close sprint",
    )?;
    board.revision = new_oid.to_string();

    sync_backup(repo, board_id);
    Ok(board)
}

/// Moves cards between two boards, preserving each card's identity — id, comments, DOD and every
/// other field travel verbatim; only `board_id` (and, if the destination lacks the original column,
/// `column_id`) changes. This is what a sprint's carry-over uses, so the leftovers keep their history
/// instead of arriving in the new sprint as fresh cards.
///
/// The destination is written **first**, then the source is emptied: if the second commit fails, the
/// cards exist twice rather than not at all, which is the recoverable direction of that failure.
/// Moves cards to another board, keeping their identifiers.
///
/// The identifier travels because the prefix is the *card's*, not the board's — which is the whole
/// reason it was moved off the board. The target board's counter for that prefix is bumped past the
/// arriving numbers so it can never hand out one that is already in use there.
///
/// `to_column_id` places them explicitly; `None` keeps each card's column when the target board has
/// one by that id and falls back to its first column otherwise (what sprint carry-over wants).
pub fn move_cards_to_board(
    repo: &Repository,
    from_board_id: &str,
    to_board_id: &str,
    card_ids: &[String],
    to_column_id: Option<&str>,
) -> Result<(), String> {
    let from_tip = read_state(repo, from_board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(from_board_id.to_string())))?;
    let to_tip = read_state(repo, to_board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(to_board_id.to_string())))?;

    let from_tree = from_tip.tree().map_err(AppError::Git)?;
    let to_tree = to_tip.tree().map_err(AppError::Git)?;
    let mut to_board = read_board_json(repo, &to_tree)?;
    let fallback_column = to_board
        .columns
        .iter()
        .min_by_key(|c| c.order)
        .map(|c| c.id.clone());
    let explicit_column = to_column_id.filter(|id| to_board.columns.iter().any(|c| &c.id == id));

    let moving: Vec<BoardCard> = read_cards(repo, &from_tree)?
        .into_iter()
        .filter(|c| card_ids.iter().any(|id| id == &c.id))
        .map(|mut card| {
            card.board_id = to_board_id.to_string();
            if let Some(target) = explicit_column {
                card.column_id = target.to_string();
            } else if !to_board.columns.iter().any(|c| c.id == card.column_id) {
                if let Some(fallback) = &fallback_column {
                    card.column_id = fallback.clone();
                }
            }
            card.updated_at = now_iso();
            card
        })
        .collect();
    if moving.is_empty() {
        return Ok(());
    }

    // The arriving cards keep their numbers, so the target board must never hand one of them out
    // again: its counter for each prefix moves past the highest number that just landed.
    for card in &moving {
        if card.prefix.is_empty() {
            continue;
        }
        let counter = to_board
            .next_card_numbers
            .entry(card.prefix.clone())
            .or_insert(1);
        *counter = (*counter).max(card.number + 1);
        if !to_board.card_prefixes.iter().any(|p| p == &card.prefix) {
            to_board.card_prefixes.push(card.prefix.clone());
        }
    }
    to_board.updated_at = now_iso();

    let mut to_tree_oid = write_board_json(repo, &to_tree, &to_board)?;
    for card in &moving {
        let tree = repo.find_tree(to_tree_oid).map_err(AppError::Git)?;
        to_tree_oid = write_card_blob(repo, &tree, card)?;
    }
    commit_state_cas(
        repo,
        to_board_id,
        &to_tip,
        to_tip.id(),
        to_tree_oid,
        "git-manager: carry cards into sprint",
    )?;

    // The cards staying behind keep their relations to the ones that left — retargeted to the board
    // those now live on, so they read as a cross-board link rather than as a dangling one.
    let mut from_tree_oid = from_tree.id();
    for card in &moving {
        let tree = repo.find_tree(from_tree_oid).map_err(AppError::Git)?;
        from_tree_oid = retarget_links_to(repo, &tree, from_board_id, &card.id, Some(to_board_id))?;
        let tree = repo.find_tree(from_tree_oid).map_err(AppError::Git)?;
        from_tree_oid = remove_card_blob(repo, &tree, &card.id)?;
    }
    commit_state_cas(
        repo,
        from_board_id,
        &from_tip,
        from_tip.id(),
        from_tree_oid,
        "git-manager: carry cards out of sprint",
    )?;

    sync_backup(repo, from_board_id);
    sync_backup(repo, to_board_id);
    Ok(())
}

/// Rewrites the board's cards so their links to `card_id` follow it — or go away.
///
/// **Only forward halves are stored** (see `BoardCardLink`), so a card leaving takes its *own* links
/// with it. What survives it are the links other cards declared *towards* it, and nothing used to
/// touch those: a deleted card left every incoming relation pointing at an id that resolves to
/// nothing, and a card carried into another sprint left them pointing at the board it came from.
/// Both rendered as a relation to "a card somewhere else" — naming, in the delete case, the very
/// board being looked at, which reads as a lie rather than as a degradation.
///
/// `moved_to` is the board the card landed on, or `None` when it was destroyed.
fn retarget_links_to(
    repo: &Repository,
    base_tree: &Tree,
    board_id: &str,
    card_id: &str,
    moved_to: Option<&str>,
) -> Result<Oid, String> {
    let mut tree_oid = base_tree.id();
    for mut card in read_cards(repo, base_tree)? {
        if card.id == card_id {
            continue;
        }
        let mut touched = false;
        card.links.retain_mut(|link| {
            if link.target_board_id != board_id || link.target_card_id != card_id {
                return true;
            }
            touched = true;
            match moved_to {
                Some(next_board) => {
                    link.target_board_id = next_board.to_string();
                    true
                }
                None => false,
            }
        });
        if !touched {
            continue;
        }
        card.updated_at = now_iso();
        let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;
        tree_oid = write_card_blob(repo, &tree, &card)?;
    }
    Ok(tree_oid)
}

pub fn delete_card(repo: &Repository, board_id: &str, card_id: &str) -> Result<(), String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;

    // The incoming relations first, in the same commit: a card and the links pointing at it have to
    // disappear together, or the board briefly describes a relation to nothing.
    let swept_oid = retarget_links_to(repo, &tree, board_id, card_id, None)?;
    let swept_tree = repo.find_tree(swept_oid).map_err(AppError::Git)?;
    let new_tree_oid = remove_card_blob(repo, &swept_tree, card_id)?;
    commit_state_cas(
        repo,
        board_id,
        &tip,
        tip.id(),
        new_tree_oid,
        "git-manager: delete board card",
    )?;

    sync_backup(repo, board_id);
    Ok(())
}

/// The board's full commit history, newest first — every card/column change is a commit, so this is
/// literally `git log` over the board's own hidden ref.
pub fn board_history(repo: &Repository, board_id: &str) -> Result<Vec<GitCommit>, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;

    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk.push(tip.id()).map_err(AppError::Git)?;

    let mut history = Vec::new();
    for oid in revwalk {
        let oid = oid.map_err(AppError::Git)?;
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        history.push(commit_to_model(&commit));
    }
    Ok(history)
}

// ─── Disaster-recovery backup (~/.git-manager/boards/<repo-slug>/<board-id>.json) ─────────────────

#[derive(Debug, Serialize, Deserialize)]
struct BoardBackup {
    board: Board,
    cards: Vec<BoardCard>,
}

fn repo_root(repo: &Repository) -> String {
    repo.workdir()
        .unwrap_or_else(|| repo.path())
        .to_string_lossy()
        .to_string()
}

fn backups_root() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(|| {
        #[allow(deprecated)]
        std::env::home_dir()
    })?;
    Some(home.join(".git-manager").join("boards"))
}

fn backup_dir(repo: &Repository) -> Option<PathBuf> {
    Some(backups_root()?.join(repo_slug(&repo_root(repo))))
}

fn backup_path(repo: &Repository, board_id: &str) -> Option<PathBuf> {
    Some(backup_dir(repo)?.join(format!("{board_id}.json")))
}

/// Mirrors the board's current state to disk. Best-effort: the git-object mutation that triggered
/// this has already succeeded by the time this runs, and a backup failure (e.g. a read-only home
/// directory) must not turn that success into an error the caller has to handle.
fn sync_backup(repo: &Repository, board_id: &str) {
    let Ok((board, cards)) = get_board(repo, board_id) else {
        return;
    };
    let Some(path) = backup_path(repo, board_id) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_vec_pretty(&BoardBackup { board, cards }) {
        let _ = fs::write(path, json);
    }
}

fn remove_backup(repo: &Repository, board_id: &str) {
    if let Some(path) = backup_path(repo, board_id) {
        let _ = fs::remove_file(path);
    }
}

/// Boards whose backup mirror exists on disk but whose ref is missing from the repo — the case a
/// backup exists to cover (repository deleted and re-cloned). A board with a live ref is not
/// "recoverable": its backup is just the normal mirror, not evidence of loss.
pub fn list_recoverable_boards(repo: &Repository) -> Result<Vec<Board>, String> {
    let Some(dir) = backup_dir(repo) else {
        return Ok(Vec::new());
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };

    let mut recoverable = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(board_id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if read_state(repo, board_id)?.is_some() {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let Ok(backup) = serde_json::from_slice::<BoardBackup>(&bytes) else {
            continue;
        };
        recoverable.push(backup.board);
    }
    Ok(recoverable)
}

/// Recreates a board's ref + a fresh initial commit from its disaster-recovery backup. Recovers
/// current state, not the original commit-by-commit history — an explicit, visible trade-off (see
/// the module doc comment) rather than the silent full data loss that not having this at all would be.
pub fn restore_board_backup(repo: &Repository, board_id: &str) -> Result<Board, String> {
    let path = backup_path(repo, board_id).ok_or_else(|| {
        String::from(AppError::Unknown(
            "could not resolve home directory".to_string(),
        ))
    })?;
    let bytes = fs::read(&path).map_err(AppError::Io)?;
    let backup: BoardBackup = serde_json::from_slice(&bytes)
        .map_err(|e| String::from(AppError::Unknown(format!("corrupt board backup: {e}"))))?;

    if read_state(repo, board_id)?.is_some() {
        return Err(String::from(AppError::BoardAlreadyExists(
            board_id.to_string(),
        )));
    }

    let mut tb = repo.treebuilder(None).map_err(AppError::Git)?;
    insert_board_json(repo, &mut tb, &backup.board)?;
    let mut tree_oid = tb.write().map_err(AppError::Git)?;
    for card in &backup.cards {
        let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;
        tree_oid = write_card_blob(repo, &tree, card)?;
    }

    commit_state_create(
        repo,
        board_id,
        tree_oid,
        "git-manager: restore board from backup",
    )?;
    sync_backup(repo, board_id);
    get_board(repo, board_id).map(|(board, _)| board)
}

#[cfg(test)]
mod tests {
    use super::*;
    // Only the tests name these directly — the service reaches them through `NewBoardCard` and
    // `BoardCardPatch`.
    use crate::models::{BoardCardLink, BoardCardSourceIssue};

    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir =
            std::env::temp_dir().join(format!("gm-test-board-{}-{}", name, std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    fn column(id: &str, order: u32) -> BoardColumn {
        BoardColumn {
            id: id.to_string(),
            name: id.to_string(),
            order,
            color: None,
            is_done: None,
        }
    }

    /// Most tests don't care about the Definition-of-Done template or the card prefix.
    fn board_with(repo: &Repository, name: &str, columns: Vec<BoardColumn>) -> Board {
        create_board(repo, name, columns, "", "").unwrap()
    }

    #[test]
    fn full_lifecycle_produces_the_expected_commit_history() {
        let (dir, repo) = init_repo("lifecycle");
        let columns = vec![column("todo", 0), column("done", 1)];
        let board = board_with(&repo, "My board", columns);
        assert_eq!(board.source, LOCAL_BOARD_SOURCE);
        assert_eq!(board.columns.len(), 2);

        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Write tests".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(card.column_id, "todo");
        assert_eq!(card.order, 0);

        let moved = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                column_id: Some("done".to_string()),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();
        assert_eq!(moved.column_id, "done");

        // create board, create card, move card — one commit each, oldest first via revwalk.
        let history = board_history(&repo, &board.id).unwrap();
        assert_eq!(history.len(), 3);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_card_removes_it_from_get_board() {
        let (dir, repo) = init_repo("delete-card");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let other = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Other task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        delete_card(&repo, &board.id, &card.id).unwrap();

        let (_, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].id, other.id);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A card whose column is removed has to land somewhere: the board only renders a card into one
    /// of its own columns, so one left behind in a column that no longer exists is invisible — and
    /// invisible is worse than moved, because nothing on screen can then archive it, delete it or
    /// even show that it is still there.
    #[test]
    fn removing_a_column_rehomes_the_cards_that_were_in_it() {
        let (dir, repo) = init_repo("remove-column");
        let board = board_with(
            &repo,
            "Board",
            vec![column("todo", 0), column("doing", 1), column("done", 2)],
        );
        let orphan = create_card(
            &repo,
            &board.id,
            "doing",
            NewBoardCard {
                title: "In the removed column".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let settled = create_card(
            &repo,
            &board.id,
            "done",
            NewBoardCard {
                title: "Somewhere else".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        // The board's revision moved with each card; re-read it rather than reusing the create's.
        let (current, _) = get_board(&repo, &board.id).unwrap();
        update_board_columns(
            &repo,
            &board.id,
            vec![column("todo", 0), column("done", 1)],
            &current.revision,
        )
        .unwrap();

        let (updated, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(updated.columns.len(), 2);
        let moved = cards.iter().find(|c| c.id == orphan.id).unwrap();
        // The *first* column by order, which is the one a reader sees at the left edge.
        assert_eq!(moved.column_id, "todo");
        // A card whose column survived is not touched, and no extra commit is spent on it.
        let untouched = cards.iter().find(|c| c.id == settled.id).unwrap();
        assert_eq!(untouched.column_id, "done");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Only forward halves are stored, so a card leaving takes its own links with it — what has to
    /// be swept is what other cards declared *towards* it. Left behind, the relation resolves to
    /// nothing and renders as pointing at "a card somewhere else", naming the board being looked at.
    #[test]
    fn deleting_a_card_takes_the_links_pointing_at_it() {
        let (dir, repo) = init_repo("delete-card-links");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let target = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Target".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let blocker = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Blocker".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let kept = BoardCardLink {
            target_board_id: board.id.clone(),
            target_card_id: "elsewhere".to_string(),
            kind: "relates".to_string(),
        };
        update_card(
            &repo,
            &board.id,
            &blocker.id,
            BoardCardPatch {
                links: Some(vec![
                    kept.clone(),
                    BoardCardLink {
                        target_board_id: board.id.clone(),
                        target_card_id: target.id.clone(),
                        kind: "blocks".to_string(),
                    },
                ]),
                ..Default::default()
            },
            &blocker.revision,
        )
        .unwrap();

        delete_card(&repo, &board.id, &target.id).unwrap();

        let (_, cards) = get_board(&repo, &board.id).unwrap();
        let survivor = cards.iter().find(|c| c.id == blocker.id).unwrap();
        // The relation to the deleted card is gone; the unrelated one is untouched.
        assert_eq!(survivor.links.len(), 1);
        assert_eq!(survivor.links[0].target_card_id, "elsewhere");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A card carried into the next sprint is still there to point at — the link follows it to the
    /// board it landed on rather than dangling on the board it left.
    #[test]
    fn carrying_a_card_over_retargets_the_links_left_behind() {
        let (dir, repo) = init_repo("carry-card-links");
        let from = board_with(&repo, "Sprint 12", vec![column("todo", 0)]);
        let to = board_with(&repo, "Sprint 13", vec![column("todo", 0)]);
        let moved = create_card(
            &repo,
            &from.id,
            "todo",
            NewBoardCard {
                title: "Unfinished".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let stays = create_card(
            &repo,
            &from.id,
            "todo",
            NewBoardCard {
                title: "Stays".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        update_card(
            &repo,
            &from.id,
            &stays.id,
            BoardCardPatch {
                links: Some(vec![BoardCardLink {
                    target_board_id: from.id.clone(),
                    target_card_id: moved.id.clone(),
                    kind: "blocks".to_string(),
                }]),
                ..Default::default()
            },
            &stays.revision,
        )
        .unwrap();

        move_cards_to_board(
            &repo,
            &from.id,
            &to.id,
            std::slice::from_ref(&moved.id),
            None,
        )
        .unwrap();

        let (_, cards) = get_board(&repo, &from.id).unwrap();
        let survivor = cards.iter().find(|c| c.id == stays.id).unwrap();
        assert_eq!(survivor.links.len(), 1);
        assert_eq!(survivor.links[0].target_board_id, to.id);
        assert_eq!(survivor.links[0].target_card_id, moved.id);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn deleting_a_missing_card_errors_with_card_not_found() {
        let (dir, repo) = init_repo("delete-missing-card");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);

        let err = delete_card(&repo, &board.id, "does-not-exist").unwrap_err();
        assert!(err.contains("CARD_NOT_FOUND"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_board_removes_it_from_list_boards_and_get_board_fails() {
        let (dir, repo) = init_repo("delete-board");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);

        delete_board(&repo, &board.id).unwrap();

        assert!(list_boards(&repo).unwrap().is_empty());
        let err = get_board(&repo, &board.id).unwrap_err();
        assert!(err.contains("BOARD_NOT_FOUND"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn two_boards_on_the_same_repo_have_independent_histories() {
        let (dir, repo) = init_repo("two-boards");
        let board_a = board_with(&repo, "Board A", vec![column("todo", 0)]);
        let board_b = board_with(&repo, "Board B", vec![column("todo", 0)]);
        assert_ne!(board_a.id, board_b.id);

        create_card(
            &repo,
            &board_a.id,
            "todo",
            NewBoardCard {
                title: "Only in A".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        let (_, cards_a) = get_board(&repo, &board_a.id).unwrap();
        let (_, cards_b) = get_board(&repo, &board_b.id).unwrap();
        assert_eq!(cards_a.len(), 1);
        assert!(cards_b.is_empty());

        let boards = list_boards(&repo).unwrap();
        assert_eq!(boards.len(), 2);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn updating_a_card_with_a_stale_revision_is_rejected_as_a_conflict() {
        let (dir, repo) = init_repo("stale-revision");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let stale_revision = card.revision.clone();

        // Someone else's write lands first, advancing the board's revision...
        update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                title: Some("Renamed by someone else".to_string()),
                ..Default::default()
            },
            &stale_revision,
        )
        .unwrap();

        // ...so a second update built on the now-stale revision must be rejected, not silently
        // applied on top.
        let err = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                title: Some("Clobbering write".to_string()),
                ..Default::default()
            },
            &stale_revision,
        )
        .unwrap_err();
        assert!(err.contains("BOARD_CONFLICT"));

        // And the first write's title won, confirming nothing was silently overwritten.
        let (_, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(cards[0].title, "Renamed by someone else");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn deleted_board_backup_survives_and_can_be_restored() {
        let (dir, repo) = init_repo("restore-backup");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        // Simulate the ref-losing scenario the backup exists for: delete the ref directly (not via
        // `delete_board`, which intentionally also removes the backup — see its doc comment).
        repo.find_reference(&board_ref_name(&board.id))
            .unwrap()
            .delete()
            .unwrap();
        assert!(list_boards(&repo).unwrap().is_empty());

        let recoverable = list_recoverable_boards(&repo).unwrap();
        assert_eq!(recoverable.len(), 1);
        assert_eq!(recoverable[0].id, board.id);

        let restored = restore_board_backup(&repo, &board.id).unwrap();
        assert_eq!(restored.name, "Board");
        let (_, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].title, "Task");

        // Restored, so no longer "recoverable" — it has a live ref again.
        assert!(list_recoverable_boards(&repo).unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_new_card_materializes_the_boards_dod_template_and_can_then_diverge_from_it() {
        let (dir, repo) = init_repo("dod-template");
        let template = "- [ ] Tests pass\n- [ ] Reviewed";
        let board = create_board(&repo, "Board", vec![column("todo", 0)], template, "").unwrap();

        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(card.dod, template);

        // Editing one card's checklist must not touch the template...
        let edited = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                dod: Some("- [x] Tests pass\n- [ ] Reviewed\n- [ ] Documented".to_string()),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();
        assert!(edited.dod.contains("Documented"));

        // ...and the next card still gets the pristine template, not the edited copy.
        let second = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Another".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(second.dod, template);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_comment_is_attributed_to_the_repositorys_own_git_user() {
        let (dir, repo) = init_repo("comment-author");
        repo.config().unwrap().set_str("user.name", "Ada").unwrap();
        repo.config()
            .unwrap()
            .set_str("user.email", "ada@example.com")
            .unwrap();
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        let commented =
            add_card_comment(&repo, &board.id, &card.id, "Looks good", &card.revision).unwrap();

        assert_eq!(commented.comments.len(), 1);
        assert_eq!(commented.comments[0].author, "Ada");
        assert_eq!(commented.comments[0].body, "Looks good");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The tracking link has to survive a write/read round trip through the card blob, and `null`
    /// has to sever it — an earlier version declared the field but hardcoded `None` at creation, so
    /// it was never stored and nothing noticed.
    #[test]
    fn a_tracked_issue_survives_a_round_trip_and_null_untracks_it() {
        let (dir, repo) = init_repo("tracked-issue");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let issue = BoardCardSourceIssue {
            owner: "acme".to_string(),
            repo: "widgets".to_string(),
            number: 42,
        };

        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Track me".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: Some(issue.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(card.source_issue.as_ref(), Some(&issue));

        // Re-read from the ref rather than trusting the returned value: the bug this pins was a
        // field that looked right in memory and was never written.
        let (_, stored) = get_board(&repo, &board.id).unwrap();
        assert_eq!(stored[0].source_issue.as_ref(), Some(&issue));

        let untracked = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                source_issue: Some(None),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();
        assert_eq!(untracked.source_issue, None);
        // Untracking keeps the card and its content — it stops following the issue, it doesn't
        // delete what the issue had put there.
        assert_eq!(untracked.title, "Track me");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn clearing_a_blocked_reason_unblocks_the_card() {
        let (dir, repo) = init_repo("blocked-reason");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        let blocked = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                blocked_reason: Some(Some("Waiting on the API".to_string())),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();
        assert_eq!(
            blocked.blocked_reason.as_deref(),
            Some("Waiting on the API")
        );

        // A whitespace-only reason is not a reason: presence of the field *is* the blocked flag, so
        // it must not survive as "blocked, reason blank".
        let unblocked = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                blocked_reason: Some(Some("   ".to_string())),
                ..Default::default()
            },
            &blocked.revision,
        )
        .unwrap();
        assert_eq!(unblocked.blocked_reason, None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn carrying_cards_to_the_next_sprint_preserves_their_identity() {
        let (dir, repo) = init_repo("carry-over");
        let sprint_1 = board_with(&repo, "Sprint 1", vec![column("todo", 0)]);
        let done = create_card(
            &repo,
            &sprint_1.id,
            "todo",
            NewBoardCard {
                title: "Shipped".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let leftover = create_card(
            &repo,
            &sprint_1.id,
            "todo",
            NewBoardCard {
                title: "Not finished".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let leftover = add_card_comment(
            &repo,
            &sprint_1.id,
            &leftover.id,
            "blocked on X",
            &leftover.revision,
        )
        .unwrap();

        let sprint_2 = board_with(&repo, "Sprint 2", vec![column("todo", 0)]);
        move_cards_to_board(
            &repo,
            &sprint_1.id,
            &sprint_2.id,
            std::slice::from_ref(&leftover.id),
            None,
        )
        .unwrap();

        let (_, old_cards) = get_board(&repo, &sprint_1.id).unwrap();
        assert_eq!(old_cards.len(), 1);
        assert_eq!(old_cards[0].id, done.id);

        let (_, new_cards) = get_board(&repo, &sprint_2.id).unwrap();
        assert_eq!(new_cards.len(), 1);
        // Same card, not a fresh one: id and comment history travel with it.
        assert_eq!(new_cards[0].id, leftover.id);
        assert_eq!(new_cards[0].board_id, sprint_2.id);
        assert_eq!(new_cards[0].comments.len(), 1);
        assert_eq!(new_cards[0].comments[0].body, "blocked on X");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_card_whose_column_is_missing_downstream_lands_in_the_first_column() {
        let (dir, repo) = init_repo("carry-over-missing-column");
        let sprint_1 = board_with(&repo, "Sprint 1", vec![column("review", 0)]);
        let card = create_card(
            &repo,
            &sprint_1.id,
            "review",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        let sprint_2 = board_with(&repo, "Sprint 2", vec![column("todo", 3), column("wip", 1)]);
        move_cards_to_board(
            &repo,
            &sprint_1.id,
            &sprint_2.id,
            std::slice::from_ref(&card.id),
            None,
        )
        .unwrap();

        let (_, cards) = get_board(&repo, &sprint_2.id).unwrap();
        // "review" doesn't exist downstream, so it falls back to the lowest-order column — not to
        // an id nothing renders, which would make the card invisible.
        assert_eq!(cards[0].column_id, "wip");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn closing_a_sprint_freezes_its_summary_even_after_the_cards_leave() {
        let (dir, repo) = init_repo("close-sprint");
        let board = board_with(&repo, "Sprint 1", vec![column("todo", 0)]);
        create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        // Creating the card advanced the board's ref, so the revision captured above is stale.
        let (board, _) = get_board(&repo, &board.id).unwrap();

        let summary = SprintSummary {
            closed_at: "2026-08-04T10:00:00Z".to_string(),
            total_cards: 4,
            done_cards: 3,
            unfinished_cards: 1,
            completion_rate: 75,
            blocked_cards: 1,
            overdue_cards: 0,
            by_column: Vec::new(),
            by_priority: Vec::new(),
            by_assignee: Vec::new(),
            carried_over_to_board_id: None,
        };
        let board = close_board(&repo, &board.id, summary, &board.revision).unwrap();
        assert_eq!(board.closed_at.as_deref(), Some("2026-08-04T10:00:00Z"));

        // The numbers are stored, not recomputed: the board still reports 4 cards after closing,
        // although only one card object remains on it.
        let (reread, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(reread.summary.as_ref().unwrap().total_cards, 4);
        assert_eq!(reread.summary.as_ref().unwrap().completion_rate, 75);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cards_are_numbered_from_one_and_the_counter_advances_with_them() {
        let (dir, repo) = init_repo("card-numbers");
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "gm").unwrap();
        // The board's suggested prefix is normalized once, on the way in.
        assert_eq!(board.card_prefixes, vec!["GM".to_string()]);

        let first = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "First".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let second = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Second".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(first.number, 1);
        assert_eq!(second.number, 2);
        assert_eq!(first.prefix, "GM");

        let (board, _) = get_board(&repo, &board.id).unwrap();
        assert_eq!(board.next_card_numbers.get("GM"), Some(&3));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Each prefix runs its own sequence. A shared counter would leave every sequence full of holes
    /// — `GM-1, BUG-2, GM-3` reads as two lost tickets that never existed.
    #[test]
    fn each_prefix_numbers_its_own_cards() {
        let (dir, repo) = init_repo("card-numbers-per-prefix");
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "GM").unwrap();

        let gm1 = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "One".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let bug1 = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Two".to_string(),
                prefix: "BUG".to_string(),
                kind: "bug".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let gm2 = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Three".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!((gm1.prefix.as_str(), gm1.number), ("GM", 1));
        assert_eq!((bug1.prefix.as_str(), bug1.number), ("BUG", 1));
        assert_eq!((gm2.prefix.as_str(), gm2.number), ("GM", 2));
        assert_eq!(bug1.kind, "bug");

        // A prefix used for the first time joins the board's list, which is what the create dialog
        // offers next time.
        let (board, _) = get_board(&repo, &board.id).unwrap();
        assert!(board.card_prefixes.contains(&"BUG".to_string()));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A board written before per-card prefixes existed carries one prefix and one counter. It has
    /// to keep numbering exactly where it left off — folding it into the per-prefix form must not
    /// restart at 1 and hand out an identifier a card already has.
    #[test]
    fn a_board_written_with_a_single_prefix_keeps_its_sequence() {
        let (dir, repo) = init_repo("card-numbers-migration");
        let mut legacy = create_board(&repo, "Board", vec![column("todo", 0)], "", "").unwrap();
        legacy.card_prefix = "GM".to_string();
        legacy.next_card_number = Some(7);
        legacy.card_prefixes.clear();
        legacy.next_card_numbers.clear();

        // Written straight to the ref, as an older version of the app would have left it.
        let tip = read_state(&repo, &legacy.id).unwrap().unwrap();
        let tree = tip.tree().unwrap();
        let new_tree = write_board_json(&repo, &tree, &legacy).unwrap();
        commit_state_cas(&repo, &legacy.id, &tip, tip.id(), new_tree, "legacy board").unwrap();

        let (migrated, _) = get_board(&repo, &legacy.id).unwrap();
        assert_eq!(migrated.card_prefixes, vec!["GM".to_string()]);
        assert_eq!(migrated.next_card_numbers.get("GM"), Some(&7));

        let next = create_card(
            &repo,
            &legacy.id,
            "todo",
            NewBoardCard {
                title: "Next".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(next.number, 7);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A moved card keeps its identifier, so the target board must never hand that number out again.
    #[test]
    fn a_card_moved_to_another_board_keeps_its_identifier() {
        let (dir, repo) = init_repo("move-keeps-identifier");
        let ideas = create_board(&repo, "Ideas", vec![column("todo", 0)], "", "GM").unwrap();
        let sprint = create_board(&repo, "Sprint", vec![column("wip", 0)], "", "SP").unwrap();

        create_card(
            &repo,
            &ideas.id,
            "todo",
            NewBoardCard {
                title: "First".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let moved = create_card(
            &repo,
            &ideas.id,
            "todo",
            NewBoardCard {
                title: "Second".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(moved.number, 2);

        move_cards_to_board(
            &repo,
            &ideas.id,
            &sprint.id,
            std::slice::from_ref(&moved.id),
            Some("wip"),
        )
        .unwrap();

        let (target, cards) = get_board(&repo, &sprint.id).unwrap();
        assert_eq!(cards[0].prefix, "GM");
        assert_eq!(cards[0].number, 2);
        assert_eq!(cards[0].column_id, "wip");
        // Past the arriving number, so a new GM card here cannot collide with it.
        assert_eq!(target.next_card_numbers.get("GM"), Some(&3));

        let fresh = create_card(
            &repo,
            &sprint.id,
            "wip",
            NewBoardCard {
                title: "Third".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(fresh.number, 3);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The reason the counter is stored rather than derived: `max(existing) + 1` would hand the
    /// deleted card's number to the next one, and two different tickets would both have been GM-2.
    #[test]
    fn a_deleted_cards_number_is_never_handed_out_again() {
        let (dir, repo) = init_repo("card-numbers-no-reuse");
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "GM").unwrap();

        create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "First".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let second = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Second".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(second.number, 2);

        delete_card(&repo, &board.id, &second.id).unwrap();
        let third = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Third".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(third.number, 3);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn editing_the_prefix_list_never_touches_a_cards_own_prefix() {
        let (dir, repo) = init_repo("card-prefix-list");
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "GM").unwrap();
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Task".to_string(),
                prefix: "GM".to_string(),
                kind: "task".to_string(),
                source_issue: None,
                ..Default::default()
            },
        )
        .unwrap();
        let (board, _) = get_board(&repo, &board.id).unwrap();

        // "GM" is dropped from what the board offers, and a new prefix is added.
        let updated = update_board_meta(
            &repo,
            &board.id,
            "Board",
            Vec::new(),
            "",
            vec!["ops".to_string(), "OPS".to_string(), "  ".to_string()],
            &board.revision,
        )
        .unwrap();
        // Normalized, de-duplicated, blanks dropped.
        assert_eq!(updated.card_prefixes, vec!["OPS".to_string()]);

        // The existing card is still GM-1. Its prefix is its own — the list only says what may be
        // *offered* next time, never what a card already is.
        let (_, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(cards[0].prefix, "GM");
        assert_eq!(cards[0].number, card.number);

        // And GM's counter survived, so re-offering it later cannot restart on top of GM-1.
        let (board, _) = get_board(&repo, &board.id).unwrap();
        assert_eq!(board.next_card_numbers.get("GM"), Some(&2));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn board_settings_round_trip_and_reject_a_stale_revision() {
        let (dir, repo) = init_repo("board-meta");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let stale = board.revision.clone();

        let tags = vec![BoardTag {
            id: "bug".to_string(),
            name: "Bug".to_string(),
            color: "#ff0000".to_string(),
        }];
        let updated = update_board_meta(
            &repo,
            &board.id,
            "Renamed",
            tags,
            "- [ ] Done",
            Vec::new(),
            &stale,
        )
        .unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.tags.len(), 1);
        assert_eq!(updated.dod_template, "- [ ] Done");

        let err = update_board_meta(
            &repo,
            &board.id,
            "Clobber",
            Vec::new(),
            "",
            Vec::new(),
            &stale,
        )
        .unwrap_err();
        assert!(err.contains("BOARD_CONFLICT"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_board_also_removes_its_backup() {
        let (dir, repo) = init_repo("delete-removes-backup");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);

        delete_board(&repo, &board.id).unwrap();

        // An intentional delete must not be recoverable — that flow exists for accidental loss.
        assert!(list_recoverable_boards(&repo).unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }
}
