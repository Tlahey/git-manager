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
    Board, BoardCard, BoardCardPatch, BoardColumn, BoardComment, BoardTag, CardFieldChange,
    CardHistoryEntry, GitCommit, NewBoardCard, SprintSummary, LOCAL_BOARD_SOURCE,
};
use crate::utils::{commit_to_model, get_git_signature, repo_slug, short_oid};
use chrono::Utc;
use git2::{Delta, DiffOptions, ErrorCode, Oid, Repository, Sort, Tree};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, HashSet};
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

/// Reads one card's blob out of an arbitrary (possibly historical) tree — `card_history`'s way of
/// looking at a card as it stood in a past commit, as opposed to `read_cards`, which always reads
/// every card in the board's *current* tree.
fn read_card_at(
    repo: &Repository,
    tree: &Tree,
    card_id: &str,
) -> Result<Option<BoardCard>, String> {
    let Some(cards_entry) = tree.get_name(CARDS_DIR) else {
        return Ok(None);
    };
    let cards_tree = repo.find_tree(cards_entry.id()).map_err(AppError::Git)?;
    let Some(entry) = cards_tree.get_name(&format!("{card_id}.json")) else {
        return Ok(None);
    };
    let blob = repo.find_blob(entry.id()).map_err(AppError::Git)?;
    let card: BoardCard = serde_json::from_slice(blob.content())
        .map_err(|e| String::from(AppError::Unknown(format!("corrupt card blob: {e}"))))?;
    Ok(Some(card))
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
    if let Some(linked_worktree_path) = patch.linked_worktree_path {
        card.linked_worktree_path = linked_worktree_path;
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
    iteration: bool,
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
        iteration,
        closed_at: None,
        deleted_at: None,
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

/// Deletes a board, in one of the two ways its tickets can go.
///
/// **`delete_cards` erases everything**: the ref, and the `~/.git-manager/boards/` mirror with it. A
/// local board's cards live inside its ref, so dropping the ref takes them, and removing the mirror
/// is what makes that final — an erasure must not come back through the "recoverable board" restore
/// flow, which exists for a repository that was deleted and re-cloned, not as an undo for this.
///
/// **Otherwise the board is tombstoned**: every card is archived, `deleted_at` is stamped, and the
/// ref *survives*. This is the branch where the tickets are kept, and keeping them is precisely why
/// the ref cannot go — a card is stored inside its board, so a board erased out from under an
/// archived ticket leaves it naming something that no longer exists. Archived and still attached to
/// the board it came from is the state the caller asked for; an orphan is not.
///
/// The board then behaves like a closed sprint one step further along: hidden from the picker unless
/// the user asks to see deleted boards, read-only when they do, and its archive still readable. The
/// one thing it is not is *gone*, which is the honest price of not destroying the work.
pub fn delete_board(repo: &Repository, board_id: &str, delete_cards: bool) -> Result<(), String> {
    if delete_cards {
        if let Ok(mut reference) = repo.find_reference(&board_ref_name(board_id)) {
            reference.delete().map_err(AppError::Git)?;
        }
        remove_backup(repo, board_id);
        return Ok(());
    }

    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let now = now_iso();
    let mut board = read_board_json(repo, &tree)?;
    board.deleted_at = Some(now.clone());
    board.updated_at = now.clone();
    let mut tree_oid = write_board_json(repo, &tree, &board)?;

    // Archived in the same commit as the tombstone, so no state of the ref ever shows a deleted
    // board still holding live cards.
    for mut card in read_cards(repo, &tree)? {
        if card.archived_at.is_some() {
            continue;
        }
        card.archived_at = Some(now.clone());
        card.updated_at = now.clone();
        let base = repo.find_tree(tree_oid).map_err(AppError::Git)?;
        tree_oid = write_card_blob(repo, &base, &card)?;
    }

    commit_state_cas(
        repo,
        board_id,
        &tip,
        tip.id(),
        tree_oid,
        "git-manager: delete board, archiving its cards",
    )?;

    sync_backup(repo, board_id);
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
        linked_worktree_path: None,
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
///
/// `parent_comment_id`, when present, must reference a comment that already exists on this card —
/// otherwise the thread a client would render doesn't match anything anyone could look up. Because a
/// reply's parent has to exist at write time, the normal write path can never produce a cycle; a
/// hand-edited card file is the only way to fake one, and that's guarded defensively on the render
/// side (`commentThreads.ts`) instead of here.
pub fn add_card_comment(
    repo: &Repository,
    board_id: &str,
    card_id: &str,
    body: &str,
    parent_comment_id: Option<&str>,
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

    if let Some(parent_id) = parent_comment_id {
        if !cards[idx].comments.iter().any(|c| c.id == parent_id) {
            return Err(String::from(AppError::CommentNotFound(
                parent_id.to_string(),
            )));
        }
    }

    let signature = get_git_signature(repo)?;
    let author = signature.name().unwrap_or("unknown").to_string();
    let now = now_iso();

    // `generate_id` was never load-bearing as a reference target before this — a collision only
    // ever cost a duplicate React key. Now that `parent_comment_id` can point at it, guard the
    // (still astronomically unlikely) case defensively before pushing.
    let mut id = generate_id(card_id);
    while cards[idx].comments.iter().any(|c| c.id == id) {
        id = generate_id(card_id);
    }

    cards[idx].comments.push(BoardComment {
        id,
        author,
        body: body.to_string(),
        created_at: now.clone(),
        parent_comment_id: parent_comment_id.map(str::to_string),
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

/// Deletes several cards in **one** commit — the archived-card purge (`ArchivedCardsDialog`'s danger
/// zone), which is one gesture over a set the user reviewed as a set.
///
/// Not a loop over `delete_card` on the frontend, for two reasons. A purge of thirty cards would
/// otherwise be thirty commits saying "delete board card" in the board's history, burying whatever
/// came before it, and thirty rewrites of the disaster-recovery mirror — of which only the last is
/// the state anyone wanted. It would also be interruptible halfway: a failure on card seventeen
/// leaves the board in a state no one asked for, whereas the compare-and-swap here either lands the
/// whole purge or none of it.
///
/// An id naming no card is **skipped**, not an error — unlike `delete_card`, which is asked about one
/// card and has nothing to do if it is gone. The caller here derived this list from what it last read,
/// and a card another window deleted in between is a list that has already got what it wanted; failing
/// would refuse the other twenty-nine deletions over it. The count returned is what actually went.
pub fn delete_cards(
    repo: &Repository,
    board_id: &str,
    card_ids: &[String],
) -> Result<usize, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let mut tree_oid = tree.id();
    let mut deleted = 0usize;
    for card_id in card_ids {
        let current = repo.find_tree(tree_oid).map_err(AppError::Git)?;
        if !read_cards(repo, &current)?.iter().any(|c| &c.id == card_id) {
            continue;
        }
        // Same rule as `delete_card`: the links pointing at a card go in the same commit it does.
        let swept_oid = retarget_links_to(repo, &current, board_id, card_id, None)?;
        let swept_tree = repo.find_tree(swept_oid).map_err(AppError::Git)?;
        tree_oid = remove_card_blob(repo, &swept_tree, card_id)?;
        deleted += 1;
    }

    // Nothing to record: an empty purge must not leave a commit claiming one happened.
    if deleted == 0 {
        return Ok(0);
    }

    commit_state_cas(
        repo,
        board_id,
        &tip,
        tip.id(),
        tree_oid,
        "git-manager: delete board cards",
    )?;

    sync_backup(repo, board_id);
    Ok(deleted)
}

/// Archives — or un-archives — a set of cards in **one** commit.
///
/// The bulk counterpart of an `archived_at` patch through `update_card`, and it exists for the same
/// reason `delete_cards` does: "archive this column" is one gesture over a set the user chose as a
/// set, and thirty commits saying "update board card" is not a record of it. Unlike `delete_cards`
/// this is reversible, which is exactly why it is the *default* offered on a column and the purge is
/// the one behind a danger zone.
///
/// `archived_at` is stamped here rather than taken from the caller, so every card in one gesture
/// carries the same instant and the archive list orders them as the single event they were. Pass
/// `false` for `archived` to clear it.
///
/// Cards already in the requested state are skipped rather than rewritten: re-archiving a column that
/// is half archived must not restamp the half that was put away last week under today's date.
pub fn set_cards_archived(
    repo: &Repository,
    board_id: &str,
    card_ids: &[String],
    archived: bool,
) -> Result<usize, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;

    let now = now_iso();
    let wanted: Option<String> = archived.then(|| now.clone());

    let mut tree_oid = tree.id();
    let mut changed = 0usize;
    for mut card in read_cards(repo, &tree)? {
        if !card_ids.contains(&card.id) || card.archived_at.is_some() == archived {
            continue;
        }
        card.archived_at = wanted.clone();
        card.updated_at = now.clone();
        let base = repo.find_tree(tree_oid).map_err(AppError::Git)?;
        tree_oid = write_card_blob(repo, &base, &card)?;
        changed += 1;
    }

    if changed == 0 {
        return Ok(0);
    }

    commit_state_cas(
        repo,
        board_id,
        &tip,
        tip.id(),
        tree_oid,
        if archived {
            "git-manager: archive board cards"
        } else {
            "git-manager: unarchive board cards"
        },
    )?;

    sync_backup(repo, board_id);
    Ok(changed)
}

/// Hands an identifier to every card that has none, drawing them from `prefix`'s sequence.
///
/// The retrofit for a board created without a prefix: its cards were written with an empty prefix and
/// number `0`, which is not "no identifier yet" but "no identifier at all" — nothing on the card can
/// be rendered as `GM-7`, and no later edit gives it one, since a card's number is only ever
/// allocated at creation. This is that allocation, run once, for the cards that missed it.
///
/// Numbers go out in the board's own reading order — column order, then the card's order within it —
/// so a board read top-left to bottom-right numbers the way it is read. Any other order (blob name,
/// last-updated) would look shuffled for no reason a user could see.
///
/// A card that already carries a number is never touched, whatever its prefix: renumbering a ticket
/// that has been quoted somewhere is worse than leaving one unnumbered. One commit for the whole set,
/// like `set_cards_archived`, and the advanced counter travels in it — same invariant as
/// `create_card`: no number exists on a card the board doesn't know it gave out.
pub fn assign_card_identifiers(
    repo: &Repository,
    board_id: &str,
    prefix: &str,
) -> Result<usize, String> {
    let prefix = prefix.trim().to_uppercase();
    if prefix.is_empty() {
        return Ok(0);
    }

    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;
    let tree = tip.tree().map_err(AppError::Git)?;
    let mut board = read_board_json(repo, &tree)?;

    let mut cards = read_cards(repo, &tree)?;
    cards.sort_by_key(|card| {
        let column = board
            .columns
            .iter()
            .find(|c| c.id == card.column_id)
            // A card whose column no longer exists sorts last rather than first: it is off the board
            // as far as the eye is concerned, so it should not take the low numbers.
            .map_or(u32::MAX, |c| c.order);
        (column, card.order)
    });

    let now = now_iso();
    let mut tree_oid = tree.id();
    let mut assigned = 0usize;
    for mut card in cards {
        if !card.prefix.is_empty() || card.number != 0 {
            continue;
        }
        let counter = board.next_card_numbers.entry(prefix.clone()).or_insert(1);
        card.number = *counter;
        *counter += 1;
        card.prefix = prefix.clone();
        card.updated_at = now.clone();
        let base = repo.find_tree(tree_oid).map_err(AppError::Git)?;
        tree_oid = write_card_blob(repo, &base, &card)?;
        assigned += 1;
    }

    if assigned == 0 {
        return Ok(0);
    }

    if !board.card_prefixes.contains(&prefix) {
        board.card_prefixes.push(prefix);
    }
    board.updated_at = now;
    let base = repo.find_tree(tree_oid).map_err(AppError::Git)?;
    let new_tree_oid = write_board_json(repo, &base, &board)?;

    commit_state_cas(
        repo,
        board_id,
        &tip,
        tip.id(),
        new_tree_oid,
        "git-manager: assign board card identifiers",
    )?;

    sync_backup(repo, board_id);
    Ok(assigned)
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

fn history_entry(
    commit: &git2::Commit,
    kind: &str,
    changes: Vec<CardFieldChange>,
) -> CardHistoryEntry {
    let author = commit.author();
    let oid = commit.id().to_string();
    CardHistoryEntry {
        short_oid: short_oid(&oid),
        oid,
        author_name: author.name().unwrap_or("").to_string(),
        author_email: author.email().unwrap_or("").to_string(),
        timestamp: author.when().seconds(),
        kind: kind.to_string(),
        changes,
    }
}

/// Every field worth surfacing in a history entry, description/DOD included — the frontend's
/// before/after view lets the previous text be copied back in to undo an edit, which needs the
/// actual value, not just the fact that it changed. Comments are diffed separately below since they
/// only ever append.
fn diff_card_fields(old: &BoardCard, new: &BoardCard) -> Vec<CardFieldChange> {
    let mut changes = Vec::new();
    let mut push = |field: &str, old_value: Option<String>, new_value: Option<String>| {
        changes.push(CardFieldChange {
            field: field.to_string(),
            old_value,
            new_value,
        });
    };

    if old.title != new.title {
        push("title", Some(old.title.clone()), Some(new.title.clone()));
    }
    if old.column_id != new.column_id {
        push(
            "columnId",
            Some(old.column_id.clone()),
            Some(new.column_id.clone()),
        );
    }
    if old.priority != new.priority {
        push(
            "priority",
            Some(old.priority.clone()),
            Some(new.priority.clone()),
        );
    }
    if old.assignee != new.assignee {
        push("assignee", old.assignee.clone(), new.assignee.clone());
    }
    if old.due_date != new.due_date {
        push("dueDate", old.due_date.clone(), new.due_date.clone());
    }
    if old.blocked_reason != new.blocked_reason {
        push(
            "blockedReason",
            old.blocked_reason.clone(),
            new.blocked_reason.clone(),
        );
    }
    if old.kind != new.kind {
        push("kind", Some(old.kind.clone()), Some(new.kind.clone()));
    }
    if old.linked_branch != new.linked_branch {
        push(
            "linkedBranch",
            old.linked_branch.clone(),
            new.linked_branch.clone(),
        );
    }
    if old.archived_at.is_some() != new.archived_at.is_some() {
        push(
            "archived",
            Some(old.archived_at.is_some().to_string()),
            Some(new.archived_at.is_some().to_string()),
        );
    }
    if old.description != new.description {
        push(
            "description",
            Some(old.description.clone()),
            Some(new.description.clone()),
        );
    }
    if old.dod != new.dod {
        push("dod", Some(old.dod.clone()), Some(new.dod.clone()));
    }
    let mut old_tags = old.tag_ids.clone();
    old_tags.sort();
    let mut new_tags = new.tag_ids.clone();
    new_tags.sort();
    if old_tags != new_tags {
        push("tagIds", Some(old_tags.join(",")), Some(new_tags.join(",")));
    }

    // Comments are append-only (no delete/edit mutation exists), so the only meaningful diff is
    // "which ids are new" — a body that changed on a still-present id can't happen.
    let old_ids: HashSet<&str> = old.comments.iter().map(|c| c.id.as_str()).collect();
    for comment in &new.comments {
        if !old_ids.contains(comment.id.as_str()) {
            push("comment", None, Some(comment.body.clone()));
        }
    }

    changes
}

/// One card's history, newest first — every commit that actually touched `cards/<card_id>.json`,
/// diffed field-by-field against its parent. Unlike `board_history` (every commit on the ref,
/// undifferentiated) this walks the same ref but keeps only the commits relevant to one card, and
/// turns each into what changed rather than the storage-level fact that *a* card changed.
///
/// The ref is linear (every mutation's parent is the previous tip — see the module doc comment), so
/// following each commit's first parent is exhaustive, not a simplification. Stops as soon as the
/// card's creation commit is found: nothing before a card existed is part of its history.
pub fn card_history(
    repo: &Repository,
    board_id: &str,
    card_id: &str,
) -> Result<Vec<CardHistoryEntry>, String> {
    let tip = read_state(repo, board_id)?
        .ok_or_else(|| String::from(AppError::BoardNotFound(board_id.to_string())))?;

    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(AppError::Git)?;
    revwalk.push(tip.id()).map_err(AppError::Git)?;

    let card_path = format!("{CARDS_DIR}/{card_id}.json");
    let mut entries = Vec::new();

    for oid in revwalk {
        let oid = oid.map_err(AppError::Git)?;
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        let tree = commit.tree().map_err(AppError::Git)?;

        let parent = commit.parents().next();
        let status: Option<Delta> = match &parent {
            None => tree
                .get_path(std::path::Path::new(&card_path))
                .is_ok()
                .then_some(Delta::Added),
            Some(parent) => {
                let parent_tree = parent.tree().map_err(AppError::Git)?;
                let mut opts = DiffOptions::new();
                opts.pathspec(&card_path);
                repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), Some(&mut opts))
                    .map_err(AppError::Git)?
                    .deltas()
                    .next()
                    .map(|delta| delta.status())
            }
        };

        let Some(status) = status else { continue };

        match status {
            Delta::Added | Delta::Copied | Delta::Untracked => {
                entries.push(history_entry(&commit, "created", Vec::new()));
                break;
            }
            Delta::Deleted => {
                entries.push(history_entry(&commit, "deleted", Vec::new()));
            }
            _ => {
                let Some(parent) = parent else { continue };
                let parent_tree = parent.tree().map_err(AppError::Git)?;
                let (Some(old_card), Some(new_card)) = (
                    read_card_at(repo, &parent_tree, card_id)?,
                    read_card_at(repo, &tree, card_id)?,
                ) else {
                    continue;
                };
                let changes = diff_card_fields(&old_card, &new_card);
                if !changes.is_empty() {
                    entries.push(history_entry(&commit, "updated", changes));
                }
            }
        }
    }

    Ok(entries)
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

#[cfg(not(test))]
fn backups_root() -> Option<PathBuf> {
    crate::utils::app_data_dir().map(|dir| dir.join("boards"))
}

/// Under test the mirror is redirected out of the user's home — see `tests::test_backups_root` for
/// why, and for what it cost before it was.
#[cfg(test)]
fn backups_root() -> Option<PathBuf> {
    Some(tests::test_backups_root())
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

    /// Where `backups_root` points while the tests run, emptied once at the start of the run.
    ///
    /// Every mutation in this module mirrors the board to `backups_root()`, and the tests exercise
    /// all of them — so with the mirror pointed at the real `~/.git-manager/boards`, each `cargo
    /// test` left one directory per test repository behind in the user's home, named after a
    /// `/tmp` path that no longer existed. Nothing ever removed them: 585 had piled up before anyone
    /// looked, next to the one board that was real.
    ///
    /// Redirecting the root is what fixes that, rather than deleting after each test: a test that
    /// panics half-way still leaves nothing outside the temp directory, and `list_recoverable_boards`
    /// / `restore_board_backup` stay covered by tests that exercise the genuine path. The wipe runs
    /// once per process, not per test, so the tests still see each other's absence of leftovers from
    /// the *previous* run without racing each other within this one.
    pub(super) fn test_backups_root() -> PathBuf {
        static CLEANED: std::sync::Once = std::sync::Once::new();
        let root = std::env::temp_dir().join("gm-test-board-backups");
        CLEANED.call_once(|| {
            std::fs::remove_dir_all(&root).ok();
        });
        root
    }

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
        create_board(repo, name, columns, "", "", true).unwrap()
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

    /// The archived-card purge is one gesture, so it is one commit — and it sweeps the links pointing
    /// at what it removes exactly like the single-card delete does, since a purge that left dangling
    /// relations behind would be a worse version of the bug `delete_card` already fixed.
    #[test]
    fn delete_cards_removes_the_whole_set_in_a_single_commit() {
        let (dir, repo) = init_repo("delete-cards-bulk");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let make = |title: &str| {
            create_card(
                &repo,
                &board.id,
                "todo",
                NewBoardCard {
                    title: title.to_string(),
                    ..Default::default()
                },
            )
            .unwrap()
        };
        let first = make("Archived one");
        let second = make("Archived two");
        let survivor = make("Still on the board");

        // The survivor declares a relation towards one of the doomed cards.
        update_card(
            &repo,
            &board.id,
            &survivor.id,
            BoardCardPatch {
                links: Some(vec![BoardCardLink {
                    target_board_id: board.id.clone(),
                    target_card_id: second.id.clone(),
                    kind: "blocks".to_string(),
                }]),
                ..Default::default()
            },
            &survivor.revision,
        )
        .unwrap();

        let before = board_history(&repo, &board.id).unwrap().len();
        let deleted =
            delete_cards(&repo, &board.id, &[first.id.clone(), second.id.clone()]).unwrap();
        assert_eq!(deleted, 2);

        let (_, cards) = get_board(&repo, &board.id).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].id, survivor.id);
        // Its link went with the card it pointed at, rather than resolving to nothing.
        assert!(cards[0].links.is_empty());
        // Two cards, one commit — not one commit each.
        assert_eq!(board_history(&repo, &board.id).unwrap().len(), before + 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A card someone else removed in between is a list that has already got what it wanted — unlike
    /// `delete_card`, which is asked about one card and errors. Failing here would refuse every other
    /// deletion in the set over it.
    #[test]
    fn delete_cards_skips_ids_that_name_nothing_and_reports_the_real_count() {
        let (dir, repo) = init_repo("delete-cards-missing");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Real".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let deleted =
            delete_cards(&repo, &board.id, &[card.id.clone(), "gone".to_string()]).unwrap();
        assert_eq!(deleted, 1);
        assert!(get_board(&repo, &board.id).unwrap().1.is_empty());

        // Nothing to remove leaves no commit claiming a purge happened.
        let before = board_history(&repo, &board.id).unwrap().len();
        assert_eq!(
            delete_cards(&repo, &board.id, &["gone".to_string()]).unwrap(),
            0
        );
        assert_eq!(board_history(&repo, &board.id).unwrap().len(), before);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_board_removes_it_from_list_boards_and_get_board_fails() {
        let (dir, repo) = init_repo("delete-board");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);

        delete_board(&repo, &board.id, true).unwrap();

        assert!(list_boards(&repo).unwrap().is_empty());
        let err = get_board(&repo, &board.id).unwrap_err();
        assert!(err.contains("BOARD_NOT_FOUND"));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The retrofit for a board created without a prefix: its cards carry no identifier at all, and
    /// numbering them is the only way one ever appears on them.
    #[test]
    fn assign_card_identifiers_numbers_the_cards_that_have_none() {
        let (dir, repo) = init_repo("assign-identifiers");
        let board = board_with(&repo, "Board", vec![column("todo", 0), column("doing", 1)]);
        let make = |column_id: &str, title: &str| {
            create_card(
                &repo,
                &board.id,
                column_id,
                NewBoardCard {
                    title: title.to_string(),
                    ..Default::default()
                },
            )
            .unwrap()
        };
        // Created out of reading order on purpose — the numbers must follow the board, not the
        // order the cards happened to be written in.
        let second_column = make("doing", "In flight");
        let first = make("todo", "One");
        let second = make("todo", "Two");

        let before = board_history(&repo, &board.id).unwrap().len();
        assert_eq!(assign_card_identifiers(&repo, &board.id, "gm").unwrap(), 3);
        // One gesture, one commit, like archiving a column.
        assert_eq!(board_history(&repo, &board.id).unwrap().len(), before + 1);

        let (updated, cards) = get_board(&repo, &board.id).unwrap();
        let identifier = |id: &str| {
            let card = cards.iter().find(|c| c.id == id).unwrap();
            format!("{}-{}", card.prefix, card.number)
        };
        // Lowercase in, normalized out — the same rule the create dialog and board settings apply.
        assert_eq!(identifier(&first.id), "GM-1");
        assert_eq!(identifier(&second.id), "GM-2");
        assert_eq!(identifier(&second_column.id), "GM-3");
        // The board now offers the prefix and knows what it handed out, so the next card created
        // continues the sequence instead of restarting it.
        assert_eq!(updated.card_prefixes, vec!["GM".to_string()]);
        let next = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Four".to_string(),
                prefix: "GM".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(next.number, 4);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A ticket that already has a number has been quoted somewhere. Re-running the retrofit — or
    /// running it on a board where only some cards were created before it had a prefix — must leave
    /// those alone, and must not spend a commit when there is nothing to do.
    #[test]
    fn assign_card_identifiers_never_renumbers_a_card_that_has_one() {
        let (dir, repo) = init_repo("assign-identifiers-idempotent");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let numbered = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Already GM-1".to_string(),
                prefix: "GM".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let unnumbered = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "No identifier".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(assign_card_identifiers(&repo, &board.id, "GM").unwrap(), 1);
        let (_, cards) = get_board(&repo, &board.id).unwrap();
        let card = |id: &str| cards.iter().find(|c| c.id == id).unwrap().clone();
        assert_eq!(card(&numbered.id).number, 1);
        assert_eq!(card(&unnumbered.id).number, 2);

        // Nothing left to number: no commit, and an empty prefix is a no-op rather than a board-wide
        // rewrite under a blank sequence.
        let before = board_history(&repo, &board.id).unwrap().len();
        assert_eq!(assign_card_identifiers(&repo, &board.id, "GM").unwrap(), 0);
        assert_eq!(assign_card_identifiers(&repo, &board.id, "  ").unwrap(), 0);
        assert_eq!(board_history(&repo, &board.id).unwrap().len(), before);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Archiving a column is one gesture: one commit, and one instant stamped on every card it took,
    /// so the archive list orders them as the single event they were.
    #[test]
    fn set_cards_archived_stamps_one_instant_in_a_single_commit() {
        let (dir, repo) = init_repo("archive-cards");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let make = |title: &str| {
            create_card(
                &repo,
                &board.id,
                "todo",
                NewBoardCard {
                    title: title.to_string(),
                    ..Default::default()
                },
            )
            .unwrap()
        };
        let first = make("One");
        let second = make("Two");
        let untouched = make("Not in the set");

        let before = board_history(&repo, &board.id).unwrap().len();
        let changed = set_cards_archived(
            &repo,
            &board.id,
            &[first.id.clone(), second.id.clone()],
            true,
        )
        .unwrap();
        assert_eq!(changed, 2);
        assert_eq!(board_history(&repo, &board.id).unwrap().len(), before + 1);

        let (_, cards) = get_board(&repo, &board.id).unwrap();
        let archived_at = |id: &str| {
            cards
                .iter()
                .find(|c| c.id == id)
                .unwrap()
                .archived_at
                .clone()
        };
        assert!(archived_at(&first.id).is_some());
        // One gesture, one instant.
        assert_eq!(archived_at(&first.id), archived_at(&second.id));
        assert!(archived_at(&untouched.id).is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Re-archiving a column that is already half archived must not restamp the half put away last
    /// week under today's date — the archive list is ordered by that field.
    #[test]
    fn set_cards_archived_leaves_an_already_archived_card_alone() {
        let (dir, repo) = init_repo("archive-cards-idempotent");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Already away".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        set_cards_archived(&repo, &board.id, std::slice::from_ref(&card.id), true).unwrap();
        let (_, cards) = get_board(&repo, &board.id).unwrap();
        let first_stamp = cards[0].archived_at.clone();

        let before = board_history(&repo, &board.id).unwrap().len();
        assert_eq!(
            set_cards_archived(&repo, &board.id, std::slice::from_ref(&card.id), true).unwrap(),
            0
        );
        // No change means no commit, and the original date survives.
        assert_eq!(board_history(&repo, &board.id).unwrap().len(), before);
        assert_eq!(
            get_board(&repo, &board.id).unwrap().1[0].archived_at,
            first_stamp
        );

        // ...and the same call with `false` puts it back on the board.
        assert_eq!(
            set_cards_archived(&repo, &board.id, std::slice::from_ref(&card.id), false).unwrap(),
            1
        );
        assert!(get_board(&repo, &board.id).unwrap().1[0]
            .archived_at
            .is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Keeping a deleted board's tickets means keeping the board: a card is stored *inside* its
    /// board, so erasing the ref out from under an archived ticket would leave it naming something
    /// that no longer exists — lost with extra steps, not archived.
    #[test]
    fn deleting_a_board_without_its_cards_tombstones_it_and_archives_them() {
        let (dir, repo) = init_repo("delete-board-tombstone");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let make = |title: &str| {
            create_card(
                &repo,
                &board.id,
                "todo",
                NewBoardCard {
                    title: title.to_string(),
                    ..Default::default()
                },
            )
            .unwrap()
        };
        let live = make("Still going");
        let already_away = make("Put away last week");
        set_cards_archived(
            &repo,
            &board.id,
            std::slice::from_ref(&already_away.id),
            true,
        )
        .unwrap();
        let earlier_stamp = get_board(&repo, &board.id)
            .unwrap()
            .1
            .iter()
            .find(|c| c.id == already_away.id)
            .unwrap()
            .archived_at
            .clone();

        delete_board(&repo, &board.id, false).unwrap();

        // The board is still there — that is the point — and says it was deleted.
        let (tombstoned, cards) = get_board(&repo, &board.id).unwrap();
        assert!(tombstoned.deleted_at.is_some());
        assert!(list_boards(&repo).unwrap().iter().any(|b| b.id == board.id));

        // Every card archived, and still attached to the board it came from.
        assert_eq!(cards.len(), 2);
        assert!(cards.iter().all(|c| c.archived_at.is_some()));
        assert!(cards.iter().all(|c| c.board_id == board.id));
        // One already archived keeps its own date rather than being restamped by the deletion.
        let untouched = cards.iter().find(|c| c.id == already_away.id).unwrap();
        assert_eq!(untouched.archived_at, earlier_stamp);
        assert!(cards
            .iter()
            .find(|c| c.id == live.id)
            .unwrap()
            .archived_at
            .is_some());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The other branch of the same choice: nothing is kept, and nothing comes back.
    #[test]
    fn deleting_a_board_with_its_cards_leaves_nothing_behind() {
        let (dir, repo) = init_repo("delete-board-erase");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Going away".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        delete_board(&repo, &board.id, true).unwrap();

        assert!(list_boards(&repo).unwrap().is_empty());
        assert!(get_board(&repo, &board.id).is_err());
        // Not even through the restore flow — an erasure is not accidental loss.
        assert!(list_recoverable_boards(&repo).unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A board written before `iteration` existed was created when closing was the only behaviour
    /// there was — reading it back as a standing board would silently take that action away.
    #[test]
    fn a_board_written_without_the_iteration_field_reads_back_as_one() {
        let (dir, repo) = init_repo("iteration-default");
        let standing =
            create_board(&repo, "Backlog", vec![column("todo", 0)], "", "", false).unwrap();
        assert!(!standing.iteration);
        // An explicit `false` survives the round trip rather than being defaulted back to `true`.
        assert!(!get_board(&repo, &standing.id).unwrap().0.iteration);

        let legacy: Board = serde_json::from_str(
            r#"{"id":"b1","name":"Old","source":"local","columns":[],"revision":"",
                "schemaVersion":2,"createdAt":"2026-01-01","updatedAt":"2026-01-01"}"#,
        )
        .unwrap();
        assert!(legacy.iteration);

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
        let board =
            create_board(&repo, "Board", vec![column("todo", 0)], template, "", true).unwrap();

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

        let commented = add_card_comment(
            &repo,
            &board.id,
            &card.id,
            "Looks good",
            None,
            &card.revision,
        )
        .unwrap();

        assert_eq!(commented.comments.len(), 1);
        assert_eq!(commented.comments[0].author, "Ada");
        assert_eq!(commented.comments[0].body, "Looks good");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_reply_carries_its_parent_comment_id() {
        let (dir, repo) = init_repo("reply-parent-id");
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

        let first = add_card_comment(
            &repo,
            &board.id,
            &card.id,
            "Looks good",
            None,
            &card.revision,
        )
        .unwrap();
        let parent_id = first.comments[0].id.clone();
        let replied = add_card_comment(
            &repo,
            &board.id,
            &card.id,
            "Agreed",
            Some(&parent_id),
            &first.revision,
        )
        .unwrap();

        assert_eq!(replied.comments.len(), 2);
        assert_eq!(replied.comments[1].parent_comment_id, Some(parent_id));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn add_card_comment_rejects_an_unknown_parent_id() {
        let (dir, repo) = init_repo("reply-unknown-parent");
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

        let err = add_card_comment(
            &repo,
            &board.id,
            &card.id,
            "Agreed",
            Some("does-not-exist"),
            &card.revision,
        )
        .unwrap_err();
        assert!(err.contains("COMMENT_NOT_FOUND"));

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
    fn linking_a_worktree_persists_and_can_be_unlinked() {
        let (dir, repo) = init_repo("worktree-link");
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
        assert_eq!(card.linked_worktree_path, None);

        let linked = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                linked_worktree_path: Some(Some("/tmp/repo.worktrees/task".to_string())),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();
        assert_eq!(
            linked.linked_worktree_path.as_deref(),
            Some("/tmp/repo.worktrees/task")
        );

        // Re-read from the ref rather than trusting the returned value, same as the source-issue
        // test above: the field must actually be written, not just present on the in-memory result.
        let (_, stored) = get_board(&repo, &board.id).unwrap();
        assert_eq!(
            stored[0].linked_worktree_path.as_deref(),
            Some("/tmp/repo.worktrees/task")
        );

        let unlinked = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                linked_worktree_path: Some(None),
                ..Default::default()
            },
            &linked.revision,
        )
        .unwrap();
        assert_eq!(unlinked.linked_worktree_path, None);

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
            None,
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
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "gm", true).unwrap();
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
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "GM", true).unwrap();

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
        let mut legacy =
            create_board(&repo, "Board", vec![column("todo", 0)], "", "", true).unwrap();
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
        let ideas = create_board(&repo, "Ideas", vec![column("todo", 0)], "", "GM", true).unwrap();
        let sprint = create_board(&repo, "Sprint", vec![column("wip", 0)], "", "SP", true).unwrap();

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
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "GM", true).unwrap();

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
        let board = create_board(&repo, "Board", vec![column("todo", 0)], "", "GM", true).unwrap();
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

        delete_board(&repo, &board.id, true).unwrap();

        // An intentional delete must not be recoverable — that flow exists for accidental loss.
        assert!(list_recoverable_boards(&repo).unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn card_history_records_creation_updates_and_a_comment_newest_first() {
        let (dir, repo) = init_repo("card-history");
        let board = board_with(&repo, "Board", vec![column("todo", 0), column("done", 1)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Write tests".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let updated = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                priority: Some("high".to_string()),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();

        let moved = update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                column_id: Some("done".to_string()),
                ..Default::default()
            },
            &updated.revision,
        )
        .unwrap();

        add_card_comment(
            &repo,
            &board.id,
            &card.id,
            "Looks good",
            None,
            &moved.revision,
        )
        .unwrap();

        let history = card_history(&repo, &board.id, &card.id).unwrap();
        assert_eq!(history.len(), 4);

        assert_eq!(history[0].kind, "updated");
        assert_eq!(history[0].changes.len(), 1);
        assert_eq!(history[0].changes[0].field, "comment");
        assert_eq!(history[0].changes[0].old_value, None);
        assert_eq!(
            history[0].changes[0].new_value.as_deref(),
            Some("Looks good")
        );

        assert_eq!(history[1].kind, "updated");
        assert_eq!(history[1].changes[0].field, "columnId");
        assert_eq!(history[1].changes[0].old_value.as_deref(), Some("todo"));
        assert_eq!(history[1].changes[0].new_value.as_deref(), Some("done"));

        assert_eq!(history[2].kind, "updated");
        assert_eq!(history[2].changes[0].field, "priority");
        assert_eq!(history[2].changes[0].old_value.as_deref(), Some("normal"));
        assert_eq!(history[2].changes[0].new_value.as_deref(), Some("high"));

        assert_eq!(history[3].kind, "created");
        assert!(history[3].changes.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Most commits on a board's ref don't touch the queried card at all — the storage model is a
    /// full-snapshot commit per mutation, so a card's own history has to filter those out rather than
    /// report every commit as a change.
    #[test]
    fn card_history_ignores_commits_that_touched_a_different_card() {
        let (dir, repo) = init_repo("card-history-other-card");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Card A".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let other = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Card B".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        update_card(
            &repo,
            &board.id,
            &other.id,
            BoardCardPatch {
                priority: Some("high".to_string()),
                ..Default::default()
            },
            &other.revision,
        )
        .unwrap();

        let history = card_history(&repo, &board.id, &card.id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].kind, "created");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn card_history_for_an_unknown_card_id_is_empty() {
        let (dir, repo) = init_repo("card-history-unknown");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Card A".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let history = card_history(&repo, &board.id, "does-not-exist").unwrap();
        assert!(history.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The frontend's before/after view lets a previous description be copied back in to undo an
    /// edit, which needs the actual text — unlike every other free-text field this history walks,
    /// description/DOD used to be reported as "changed" with no value at all.
    #[test]
    fn card_history_carries_the_full_text_of_a_description_change() {
        let (dir, repo) = init_repo("card-history-description");
        let board = board_with(&repo, "Board", vec![column("todo", 0)]);
        let card = create_card(
            &repo,
            &board.id,
            "todo",
            NewBoardCard {
                title: "Card A".to_string(),
                description: "Before text".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        update_card(
            &repo,
            &board.id,
            &card.id,
            BoardCardPatch {
                description: Some("After text".to_string()),
                ..Default::default()
            },
            &card.revision,
        )
        .unwrap();

        let history = card_history(&repo, &board.id, &card.id).unwrap();
        assert_eq!(history[0].changes.len(), 1);
        assert_eq!(history[0].changes[0].field, "description");
        assert_eq!(
            history[0].changes[0].old_value.as_deref(),
            Some("Before text")
        );
        assert_eq!(
            history[0].changes[0].new_value.as_deref(),
            Some("After text")
        );

        std::fs::remove_dir_all(&dir).ok();
    }
}
