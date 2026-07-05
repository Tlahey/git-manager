//! True 3-way merge computation for the merge editor, independent of git's own on-disk
//! conflict-marker output. `git_conflict.rs` only sees genuine conflicts (git already folds
//! non-conflicting per-side changes into context with no trace of which side changed what) —
//! this module instead diffs base->ours and base->theirs directly from the three blobs already
//! exposed by the index conflict, and merges the two independent hunk sets itself, so that
//! changes which differ from the common ancestor but don't collide with each other ("blue"
//! blocks) can be surfaced and auto-merged, not just genuine conflicts ("red" blocks).
use crate::error::AppError;
use crate::models::{MergeBlock, MergeBlockKind, ThreeWayMergeView};
use crate::services::git_conflict::{classify_conflict_shape, ConflictShape};
use git2::{DiffOptions, Oid, Patch, Repository};

/// A contiguous changed range anchored to *base* line-space (0-based, half-open
/// `[base_start, base_start + base_len)`), together with the corresponding range in the
/// diffed side's own line-space. `base_len == 0` is a pure insertion on that side;
/// `side_len == 0` is a pure deletion.
#[derive(Debug, Clone, Copy)]
struct Hunk {
    base_start: usize,
    base_len: usize,
    side_len: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlockKind {
    Unchanged,
    OursOnly,
    TheirsOnly,
    BothSame,
    BothDifferent,
}

#[derive(Debug, Clone, Copy)]
struct MergeBlockInternal {
    kind: BlockKind,
    ours_range: (usize, usize),
    theirs_range: (usize, usize),
}

/// Splits text into lines the same way git/libgit2 counts them: a trailing newline does not
/// produce a phantom empty final line.
fn to_lines(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = text.split('\n').map(|s| s.to_string()).collect();
    if lines.last().map(|s| s.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    lines
}

fn blob_text(repo: &Repository, oid: Option<Oid>) -> Result<String, AppError> {
    match oid {
        None => Ok(String::new()),
        Some(oid) => {
            let blob = repo.find_blob(oid).map_err(AppError::Git)?;
            Ok(String::from_utf8_lossy(blob.content()).into_owned())
        }
    }
}

/// Diffs two raw text buffers using `git2::Patch::from_buffers` — the same underlying diff
/// engine `git_diff.rs` already drives via `Diff::foreach` for ordinary file diffs, just
/// invoked directly on two in-memory buffers instead of a tree-vs-workdir comparison. Buffers
/// (not blobs) are used deliberately: an empty slice cleanly represents "no ancestor" (add/add
/// conflicts) with no `Option<Blob>` plumbing, and callers already have the text in hand from
/// `blob_text`/`to_lines`. Zero context lines: the merge step below needs exact changed
/// ranges, not padded context.
fn diff_hunks(base_bytes: &[u8], side_bytes: &[u8]) -> Result<Vec<Hunk>, AppError> {
    let mut opts = DiffOptions::new();
    opts.context_lines(0);

    let patch = Patch::from_buffers(base_bytes, None, side_bytes, None, Some(&mut opts))
        .map_err(AppError::Git)?;

    let mut hunks = Vec::with_capacity(patch.num_hunks());
    for i in 0..patch.num_hunks() {
        let (hunk, _lines_in_hunk) = patch.hunk(i).map_err(AppError::Git)?;
        // `old_start` is 1-based for a non-empty range (`-1` converts it to a 0-based index),
        // but for a pure insertion (`old_lines == 0`) the unified-diff convention flips: it
        // names the line the insertion comes AFTER, so the 0-based insertion index is
        // `old_start` itself. Subtracting 1 there anchored every mid-file insertion block one
        // line too high (first symptom: the line right above an added block was colored as
        // part of it, and the center/passive boundary markers drew one line above the real
        // insertion point). Top-of-file insertions report `old_start == 0`, which is why the
        // uniform `saturating_sub(1)` version passed that test but nothing mid-file.
        let old_start = hunk.old_start() as usize;
        let base_len = hunk.old_lines() as usize;
        hunks.push(Hunk {
            base_start: if base_len == 0 {
                old_start
            } else {
                old_start.saturating_sub(1)
            },
            base_len,
            side_len: hunk.new_lines() as usize,
        });
    }
    Ok(hunks)
}

#[derive(Clone, Copy)]
enum HunkSide {
    Ours(usize),
    Theirs(usize),
}

/// Whether two base-space ranges overlap. Two pure-insert (zero-width) ranges only "overlap"
/// if they land at the exact same point (both sides competing for the same insertion slot) —
/// the generic half-open interval test never reports a zero-width range as overlapping
/// anything, so that case needs an explicit check.
fn overlaps(a_start: usize, a_end: usize, b_start: usize, b_end: usize) -> bool {
    if a_start == a_end && b_start == b_end {
        return a_start == b_start;
    }
    a_start < b_end && b_start < a_end
}

/// Merges the (already sorted, non-overlapping-within-each-list) ours/theirs hunk lists into
/// maximal unions of base ranges touched by either side. Two hunks from different sides that
/// don't actually overlap stay in separate unions (adjacent-but-disjoint edits are NOT treated
/// as conflicting), but a hunk from one side can pull in more than one hunk from the other side
/// if it overlaps both.
fn union_touched_ranges(
    ours_hunks: &[Hunk],
    theirs_hunks: &[Hunk],
) -> Vec<(usize, usize, Vec<HunkSide>)> {
    let mut events: Vec<(usize, usize, HunkSide)> = ours_hunks
        .iter()
        .enumerate()
        .map(|(i, h)| (h.base_start, h.base_start + h.base_len, HunkSide::Ours(i)))
        .chain(
            theirs_hunks
                .iter()
                .enumerate()
                .map(|(i, h)| (h.base_start, h.base_start + h.base_len, HunkSide::Theirs(i))),
        )
        .collect();
    events.sort_by_key(|e| (e.0, e.1));

    let mut unions: Vec<(usize, usize, Vec<HunkSide>)> = Vec::new();
    for (start, end, side) in events {
        if let Some(last) = unions.last_mut() {
            if overlaps(start, end, last.0, last.1) {
                last.1 = last.1.max(end);
                last.2.push(side);
                continue;
            }
        }
        unions.push((start, end, vec![side]));
    }
    unions
}

/// The core novel algorithm: sweeps base line-space left to right, alternating `Unchanged`
/// gaps with classified blocks for each touched-range union. Running offset trackers convert
/// base-space positions into each side's own line-space, since base/ours/theirs diverge in
/// length after every hunk. O(hunks) plus O(total lines) for the text-equality checks — a
/// single linear pass, no quadratic blowup.
fn merge_hunks(
    ours_hunks: &[Hunk],
    theirs_hunks: &[Hunk],
    base_len: usize,
    ours_lines: &[String],
    theirs_lines: &[String],
) -> Vec<MergeBlockInternal> {
    let unions = union_touched_ranges(ours_hunks, theirs_hunks);

    let mut blocks = Vec::new();
    let mut pos = 0usize;
    let mut ours_offset: isize = 0;
    let mut theirs_offset: isize = 0;

    let push_unchanged = |blocks: &mut Vec<MergeBlockInternal>,
                          start: usize,
                          end: usize,
                          ours_offset: isize,
                          theirs_offset: isize| {
        let ours_range = (
            (start as isize + ours_offset) as usize,
            (end as isize + ours_offset) as usize,
        );
        let theirs_range = (
            (start as isize + theirs_offset) as usize,
            (end as isize + theirs_offset) as usize,
        );
        blocks.push(MergeBlockInternal {
            kind: BlockKind::Unchanged,
            ours_range,
            theirs_range,
        });
    };

    for (u_start, u_end, members) in unions {
        if pos < u_start {
            push_unchanged(&mut blocks, pos, u_start, ours_offset, theirs_offset);
        }

        let has_ours = members.iter().any(|m| matches!(m, HunkSide::Ours(_)));
        let has_theirs = members.iter().any(|m| matches!(m, HunkSide::Theirs(_)));

        let ours_offset_before = ours_offset;
        let theirs_offset_before = theirs_offset;

        for m in &members {
            match *m {
                HunkSide::Ours(i) => {
                    let h = ours_hunks[i];
                    ours_offset += h.side_len as isize - h.base_len as isize;
                }
                HunkSide::Theirs(i) => {
                    let h = theirs_hunks[i];
                    theirs_offset += h.side_len as isize - h.base_len as isize;
                }
            }
        }

        let ours_range = (
            (u_start as isize + ours_offset_before) as usize,
            (u_end as isize + ours_offset) as usize,
        );
        let theirs_range = (
            (u_start as isize + theirs_offset_before) as usize,
            (u_end as isize + theirs_offset) as usize,
        );

        let kind = if has_ours && has_theirs {
            let ours_slice =
                &ours_lines[ours_range.0.min(ours_lines.len())..ours_range.1.min(ours_lines.len())];
            let theirs_slice = &theirs_lines
                [theirs_range.0.min(theirs_lines.len())..theirs_range.1.min(theirs_lines.len())];
            if ours_slice == theirs_slice {
                BlockKind::BothSame
            } else {
                BlockKind::BothDifferent
            }
        } else if has_ours {
            BlockKind::OursOnly
        } else {
            BlockKind::TheirsOnly
        };

        blocks.push(MergeBlockInternal {
            kind,
            ours_range,
            theirs_range,
        });

        pos = u_end;
    }

    if pos < base_len {
        push_unchanged(&mut blocks, pos, base_len, ours_offset, theirs_offset);
    }

    blocks
}

fn blocks_to_dto(
    internal: Vec<MergeBlockInternal>,
    ours_lines: &[String],
    theirs_lines: &[String],
) -> Vec<MergeBlock> {
    internal
        .into_iter()
        .enumerate()
        .map(|(id, b)| {
            let kind = match b.kind {
                BlockKind::Unchanged => MergeBlockKind::Unchanged,
                BlockKind::OursOnly => MergeBlockKind::OursOnly,
                BlockKind::TheirsOnly => MergeBlockKind::TheirsOnly,
                BlockKind::BothSame => MergeBlockKind::BothSame,
                BlockKind::BothDifferent => MergeBlockKind::BothDifferent,
            };
            let ours_start = b.ours_range.0.min(ours_lines.len());
            let ours_end = b.ours_range.1.min(ours_lines.len()).max(ours_start);
            let theirs_start = b.theirs_range.0.min(theirs_lines.len());
            let theirs_end = b.theirs_range.1.min(theirs_lines.len()).max(theirs_start);
            MergeBlock {
                block_id: id,
                kind,
                ours_start_line: ours_start + 1,
                ours_line_count: ours_end - ours_start,
                theirs_start_line: theirs_start + 1,
                theirs_line_count: theirs_end - theirs_start,
                ours_lines: ours_lines[ours_start..ours_end].to_vec(),
                theirs_lines: theirs_lines[theirs_start..theirs_end].to_vec(),
            }
        })
        .collect()
}

/// Builds the center pane's starting text: `Unchanged`/`BothSame` blocks are pre-applied (no
/// user action needed — they're not in dispute), `OursOnly`/`TheirsOnly` blocks are left as a
/// lightweight pending sentinel (still require an explicit gutter/wand action even though
/// they're non-conflicting, per the PRD). No conflict markers are ever emitted here — the
/// center pane always shows plain, natural text (the "ours" side, i.e. the current/left
/// version) for every block kind, colored/interactive per block via the frontend's
/// decorations and gutter widgets instead of literal `<<<<<<<` syntax. Concatenating every
/// block's `ours_lines` in order is exactly `ours_text` reconstructed — the frontend seeds its
/// center buffer straight from `ThreeWayMergeView::ours_text`, so no separate field is needed.
///
/// Applies every non-conflicting block (`Unchanged`/`BothSame`/`OursOnly`) plus pulls in
/// `TheirsOnly` (the only real content for a block ours never touched) into a single merged
/// text; `BothDifferent` blocks are left showing their `ours_lines` default untouched (a
/// genuine conflict has no safe automatic resolution) — the magic-wand "apply non-conflicting
/// changes" action. Computed server-side in one shot rather than as a client-side per-block
/// loop: the classification already fully determines the action, so there's no remaining
/// decision to push to the client, and rebuilding a potentially-large text buffer is better
/// done once in Rust than via N sequential IPC calls.
pub fn auto_merge_non_conflicting(blocks: &[MergeBlock]) -> String {
    let mut out: Vec<String> = Vec::new();
    for b in blocks {
        match b.kind {
            MergeBlockKind::TheirsOnly => out.extend(b.theirs_lines.iter().cloned()),
            _ => out.extend(b.ours_lines.iter().cloned()),
        }
    }
    out.join("\n")
}

fn empty_view(file_path: &str, is_binary: bool, conflict_kind: Option<&str>) -> ThreeWayMergeView {
    ThreeWayMergeView {
        file_path: file_path.to_string(),
        renderable: false,
        is_binary,
        conflict_kind: conflict_kind.map(|s| s.to_string()),
        blocks: Vec::new(),
        ours_text: String::new(),
        theirs_text: String::new(),
        conflict_count: 0,
    }
}

/// Builds the full 3-way merge view for a single conflicted file, used by the merge editor.
/// Unlike `git_conflict::get_conflict_view` (kept for its resolve/write helpers only), this
/// independently re-derives base->ours and base->theirs diffs rather than parsing git's
/// already-merged on-disk markers, so it can surface non-conflicting ("blue") changes too.
pub fn get_merge_view(
    repo: &Repository,
    _repo_path: &str,
    file_path: &str,
) -> Result<ThreeWayMergeView, AppError> {
    let shape = classify_conflict_shape(repo, file_path)?;

    let (ancestor_oid, our_oid, their_oid) = match shape {
        ConflictShape::Delete => return Ok(empty_view(file_path, false, Some("delete"))),
        ConflictShape::Rename => return Ok(empty_view(file_path, false, Some("rename"))),
        ConflictShape::Binary => return Ok(empty_view(file_path, true, None)),
        ConflictShape::Text {
            ancestor,
            our,
            their,
        } => (ancestor, our, their),
    };

    let base_text = blob_text(repo, ancestor_oid)?;
    let ours_text_raw = blob_text(repo, Some(our_oid))?;
    let theirs_text_raw = blob_text(repo, Some(their_oid))?;

    let base_lines = to_lines(&base_text);
    let ours_lines = to_lines(&ours_text_raw);
    let theirs_lines = to_lines(&theirs_text_raw);

    let ours_hunks = diff_hunks(base_text.as_bytes(), ours_text_raw.as_bytes())?;
    let theirs_hunks = diff_hunks(base_text.as_bytes(), theirs_text_raw.as_bytes())?;

    let internal = merge_hunks(
        &ours_hunks,
        &theirs_hunks,
        base_lines.len(),
        &ours_lines,
        &theirs_lines,
    );
    let blocks = blocks_to_dto(internal, &ours_lines, &theirs_lines);

    let conflict_count = blocks
        .iter()
        .filter(|b| b.kind == MergeBlockKind::BothDifferent)
        .count();

    Ok(ThreeWayMergeView {
        file_path: file_path.to_string(),
        renderable: true,
        is_binary: false,
        conflict_kind: None,
        blocks,
        ours_text: ours_lines.join("\n"),
        theirs_text: theirs_lines.join("\n"),
        conflict_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &str) -> Vec<String> {
        to_lines(text)
    }

    fn hunk(base_start: usize, base_len: usize, side_len: usize) -> Hunk {
        Hunk {
            base_start,
            base_len,
            side_len,
        }
    }

    #[test]
    fn all_unchanged() {
        let base = lines("a\nb\nc\n");
        let blocks = merge_hunks(&[], &[], base.len(), &base, &base);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].kind, BlockKind::Unchanged);
        assert_eq!(blocks[0].ours_range, (0, 3));
        assert_eq!(blocks[0].theirs_range, (0, 3));
    }

    #[test]
    fn ours_only_change() {
        // base: a,b,c — ours changes line index 1 (b -> B), theirs untouched.
        let base = lines("a\nb\nc\n");
        let ours = lines("a\nB\nc\n");
        let theirs = base.clone();
        let ours_hunks = vec![hunk(1, 1, 1)];
        let blocks = merge_hunks(&ours_hunks, &[], base.len(), &ours, &theirs);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].kind, BlockKind::Unchanged);
        assert_eq!(blocks[1].kind, BlockKind::OursOnly);
        assert_eq!(blocks[1].ours_range, (1, 2));
        assert_eq!(blocks[1].theirs_range, (1, 2));
        assert_eq!(blocks[2].kind, BlockKind::Unchanged);
    }

    #[test]
    fn theirs_only_change() {
        let base = lines("a\nb\nc\n");
        let ours = base.clone();
        let theirs = lines("a\nB\nc\n");
        let theirs_hunks = vec![hunk(1, 1, 1)];
        let blocks = merge_hunks(&[], &theirs_hunks, base.len(), &ours, &theirs);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[1].kind, BlockKind::TheirsOnly);
        assert_eq!(blocks[1].theirs_range, (1, 2));
        assert_eq!(blocks[1].ours_range, (1, 2));
    }

    #[test]
    fn both_same_change_is_not_a_conflict() {
        let base = lines("a\nb\nc\n");
        let ours = lines("a\nSAME\nc\n");
        let theirs = lines("a\nSAME\nc\n");
        let ours_hunks = vec![hunk(1, 1, 1)];
        let theirs_hunks = vec![hunk(1, 1, 1)];
        let blocks = merge_hunks(&ours_hunks, &theirs_hunks, base.len(), &ours, &theirs);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[1].kind, BlockKind::BothSame);
    }

    #[test]
    fn both_different_change_is_a_conflict() {
        let base = lines("a\nb\nc\n");
        let ours = lines("a\nOURS\nc\n");
        let theirs = lines("a\nTHEIRS\nc\n");
        let ours_hunks = vec![hunk(1, 1, 1)];
        let theirs_hunks = vec![hunk(1, 1, 1)];
        let blocks = merge_hunks(&ours_hunks, &theirs_hunks, base.len(), &ours, &theirs);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[1].kind, BlockKind::BothDifferent);
    }

    #[test]
    fn adjacent_disjoint_edits_are_not_merged_into_one_block() {
        // ours touches base[1,2), theirs touches base[3,4) — not overlapping, should stay two
        // separate single-side blocks with an unchanged gap not required between them (they're
        // already adjacent) rather than being merged into one falsely-conflicting block.
        let base = lines("a\nb\nc\nd\ne\n");
        let ours = lines("a\nB\nc\nd\ne\n");
        let theirs = lines("a\nb\nc\nD\ne\n");
        let ours_hunks = vec![hunk(1, 1, 1)];
        let theirs_hunks = vec![hunk(3, 1, 1)];
        let blocks = merge_hunks(&ours_hunks, &theirs_hunks, base.len(), &ours, &theirs);
        let kinds: Vec<_> = blocks.iter().map(|b| b.kind).collect();
        assert_eq!(
            kinds,
            vec![
                BlockKind::Unchanged,
                BlockKind::OursOnly,
                BlockKind::Unchanged,
                BlockKind::TheirsOnly,
                BlockKind::Unchanged,
            ]
        );
    }

    #[test]
    fn same_point_pure_inserts_merge_into_one_block() {
        // Both sides insert something new immediately after base line 0 (base_len 0 at the
        // same base_start) — must be merged into one block, not silently dropped/duplicated.
        let base = lines("a\nb\n");
        let ours = lines("a\nOURS-INSERT\nb\n");
        let theirs = lines("a\nTHEIRS-INSERT\nb\n");
        let ours_hunks = vec![hunk(1, 0, 1)];
        let theirs_hunks = vec![hunk(1, 0, 1)];
        let blocks = merge_hunks(&ours_hunks, &theirs_hunks, base.len(), &ours, &theirs);
        // Expect: Unchanged[0,1), one merged conflict/insert block, Unchanged[1,2).
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[1].kind, BlockKind::BothDifferent);
        assert_eq!(blocks[1].ours_range, (1, 2));
        assert_eq!(blocks[1].theirs_range, (1, 2));
    }

    #[test]
    fn add_add_empty_ancestor_same_content_is_both_same() {
        // No ancestor (base_len == 0): both sides "add" the file. If content is identical,
        // it's BothSame, not a conflict.
        let ours = lines("hello\nworld\n");
        let theirs = lines("hello\nworld\n");
        let ours_hunks = vec![hunk(0, 0, 2)];
        let theirs_hunks = vec![hunk(0, 0, 2)];
        let blocks = merge_hunks(&ours_hunks, &theirs_hunks, 0, &ours, &theirs);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].kind, BlockKind::BothSame);
        assert_eq!(blocks[0].ours_range, (0, 2));
        assert_eq!(blocks[0].theirs_range, (0, 2));
    }

    #[test]
    fn add_add_empty_ancestor_different_content_is_both_different() {
        let ours = lines("hello\n");
        let theirs = lines("goodbye\n");
        let ours_hunks = vec![hunk(0, 0, 1)];
        let theirs_hunks = vec![hunk(0, 0, 1)];
        let blocks = merge_hunks(&ours_hunks, &theirs_hunks, 0, &ours, &theirs);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].kind, BlockKind::BothDifferent);
    }

    fn dto_block(id: usize, kind: MergeBlockKind, ours: &[&str], theirs: &[&str]) -> MergeBlock {
        MergeBlock {
            block_id: id,
            kind,
            ours_start_line: 1,
            ours_line_count: ours.len(),
            theirs_start_line: 1,
            theirs_line_count: theirs.len(),
            ours_lines: ours.iter().map(|s| s.to_string()).collect(),
            theirs_lines: theirs.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn auto_merge_applies_all_but_conflicts() {
        let blocks = vec![
            dto_block(0, MergeBlockKind::Unchanged, &["a"], &["a"]),
            dto_block(1, MergeBlockKind::OursOnly, &["ours-change"], &["b"]),
            dto_block(2, MergeBlockKind::TheirsOnly, &["c"], &["theirs-change"]),
            dto_block(3, MergeBlockKind::BothSame, &["same"], &["same"]),
            dto_block(4, MergeBlockKind::BothDifferent, &["ours-x"], &["theirs-y"]),
        ];
        let merged = auto_merge_non_conflicting(&blocks);
        // Non-conflicting blocks resolve (ours-only -> ours, theirs-only -> theirs); the
        // genuine conflict is left showing its `ours_lines` default, no markers anywhere.
        assert_eq!(merged, "a\nours-change\ntheirs-change\nsame\nours-x");
    }

    #[test]
    fn diff_hunks_against_real_buffers() {
        let hunks = diff_hunks(b"a\nb\nc\n", b"a\nB\nc\n").expect("diff buffers");
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].base_start, 1);
        assert_eq!(hunks[0].base_len, 1);
        assert_eq!(hunks[0].side_len, 1);
    }

    #[test]
    fn diff_hunks_empty_ancestor_is_pure_insert() {
        let hunks = diff_hunks(b"", b"hello\nworld\n").expect("diff buffers");
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].base_start, 0);
        assert_eq!(hunks[0].base_len, 0);
        assert_eq!(hunks[0].side_len, 2);
    }

    #[test]
    fn diff_hunks_mid_file_pure_insert_anchors_after_the_named_line() {
        // Inserting X between b and c produces `@@ -2,0 +3,1 @@`: for a zero-length old range,
        // `old_start` (2) is the line the insertion comes AFTER, so the 0-based insertion index
        // is 2 itself — NOT `old_start - 1`, which anchored the block one line too high (the
        // regression this test pins down; the empty-ancestor case above can't catch it since
        // `old_start` is 0 there).
        let hunks = diff_hunks(b"a\nb\nc\n", b"a\nb\nX\nc\n").expect("diff buffers");
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].base_start, 2);
        assert_eq!(hunks[0].base_len, 0);
        assert_eq!(hunks[0].side_len, 1);
    }

    #[test]
    fn mid_file_theirs_insertion_block_carries_the_inserted_lines_only() {
        // End-to-end through merge_hunks + blocks_to_dto: theirs inserts two lines after base
        // line 2 ("b"). The TheirsOnly block must cover exactly the inserted lines (theirs
        // 3-4, 1-based) and pin ours' insertion point to line 3 (right before "c") — with the
        // old off-by-one it covered theirs 2-3, absorbing the untouched "b" line above.
        let base = lines("a\nb\nc\n");
        let ours = base.clone();
        let theirs = lines("a\nb\nX\nY\nc\n");
        let theirs_hunks = diff_hunks(b"a\nb\nc\n", b"a\nb\nX\nY\nc\n").expect("diff buffers");
        let internal = merge_hunks(&[], &theirs_hunks, base.len(), &ours, &theirs);
        let blocks = blocks_to_dto(internal, &ours, &theirs);

        let block = blocks
            .iter()
            .find(|b| b.kind == MergeBlockKind::TheirsOnly)
            .expect("a theirs-only block");
        assert_eq!(block.theirs_start_line, 3);
        assert_eq!(block.theirs_line_count, 2);
        assert_eq!(block.theirs_lines, vec!["X".to_string(), "Y".to_string()]);
        assert_eq!(block.ours_start_line, 3);
        assert_eq!(block.ours_line_count, 0);
    }
}
