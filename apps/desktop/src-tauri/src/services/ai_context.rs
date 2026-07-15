//! Git-context gathering for AI features. This is the one piece of AI plumbing that genuinely
//! belongs in Rust: it uses `git2` to snapshot the repo's uncommitted changes (diff text + the
//! list of changed files with their statuses) so a feature in `@git-manager/ai` can build its
//! prompt from it. Everything downstream — instruction, temperature, prompt shape, response
//! parsing — lives in the TS package; the backend never knows which feature the context is for.

use crate::error::AppError;
use crate::services::ai_convention::{detect_commit_convention, CommitConvention};
use git2::{Delta, DiffOptions, Repository};
use serde::Serialize;
use std::path::Path;

/// Which state to snapshot. Mirrors `AiContextScope` in `packages/ai`.
#[derive(Debug, Clone, Copy)]
pub enum AiContextScope {
    /// Index vs HEAD — what a plain commit would capture.
    Staged,
    /// Worktree vs HEAD (staged + unstaged + untracked) — everything uncommitted, for grouping.
    Working,
    /// `merge_base(base, HEAD)..HEAD` — the whole branch's changes vs its base, for a PR description.
    /// Requires a `base_ref` (see `build_ai_context`).
    Range,
}

impl AiContextScope {
    pub fn from_str(s: &str) -> Self {
        match s {
            "working" => AiContextScope::Working,
            "range" => AiContextScope::Range,
            _ => AiContextScope::Staged,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiContextFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiContext {
    pub diff: String,
    pub repo_name: String,
    pub branch: String,
    pub files: Vec<AiContextFile>,
    /// The project's own commit convention (commitlint config / git template), when it has one, so
    /// features can instruct the model to follow it. `None` when the repo defines no convention.
    pub commit_convention: Option<CommitConvention>,
    /// Subjects of the last few non-merge commits, newest first — a sample of how this project
    /// actually writes commit messages (its real convention may be enforced at the PR level, not
    /// via commitlint), so features can tell the model to match that style.
    pub recent_commits: Vec<String>,
    /// The base branch this context was diffed against (only set for `Range` scope).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_ref: Option<String>,
    /// Subjects of every non-merge commit in `base..HEAD`, newest first (only set for `Range`
    /// scope) — the actual commits a PR would contain, for the model to summarize.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range_commits: Option<Vec<String>>,
}

/// Collects the subject lines of up to `limit` recent non-merge commits, newest first. Merge
/// commits (>1 parent) are skipped because their auto-generated subjects don't reflect the
/// project's authored style.
fn collect_recent_commit_subjects(repo: &Repository, limit: usize) -> Vec<String> {
    let mut subjects = Vec::new();
    let Ok(mut revwalk) = repo.revwalk() else {
        return subjects;
    };
    if revwalk.push_head().is_err() {
        return subjects;
    }
    for oid in revwalk {
        if subjects.len() >= limit {
            break;
        }
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if commit.parent_count() > 1 {
            continue;
        }
        if let Some(summary) = commit.summary() {
            let trimmed = summary.trim();
            if !trimmed.is_empty() {
                subjects.push(trimmed.to_string());
            }
        }
    }
    subjects
}

/// Collects the subject lines of every non-merge commit in `base_oid..head_oid` (reachable from
/// HEAD but not the base), newest first. Unlike `collect_recent_commit_subjects` this is unbounded —
/// a PR description should reflect all of the branch's commits, not just a style sample.
fn collect_range_commit_subjects(
    repo: &Repository,
    base_oid: git2::Oid,
    head_oid: git2::Oid,
) -> Vec<String> {
    let mut subjects = Vec::new();
    let Ok(mut revwalk) = repo.revwalk() else {
        return subjects;
    };
    if revwalk.push(head_oid).is_err() {
        return subjects;
    }
    // Hiding the base excludes commits already on it, leaving only the branch's own commits.
    let _ = revwalk.hide(base_oid);
    for oid in revwalk {
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if commit.parent_count() > 1 {
            continue;
        }
        if let Some(summary) = commit.summary() {
            let trimmed = summary.trim();
            if !trimmed.is_empty() {
                subjects.push(trimmed.to_string());
            }
        }
    }
    subjects
}

fn status_word(delta: Delta) -> &'static str {
    match delta {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Modified => "modified",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Untracked => "untracked",
        Delta::Typechange => "typechange",
        _ => "modified",
    }
}

/// Opens the repo once and gathers everything a feature's prompt might need: the diff for the
/// requested `scope` as plain patch text, the repo's directory name, the current branch's short
/// name, and the changed files with their statuses. For `Range` scope, `base_ref` (a branch/ref the
/// PR would target, e.g. `main` or `origin/main`) is required and the diff spans `base..HEAD`.
pub fn build_ai_context(
    repo_path: &str,
    scope: AiContextScope,
    base_ref: Option<&str>,
) -> Result<AiContext, AppError> {
    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    // Range-scope extras, filled in only for that arm.
    let mut resolved_base_ref: Option<String> = None;
    let mut range_commits: Option<Vec<String>> = None;

    let diff = match scope {
        AiContextScope::Staged => {
            let mut index = repo.index().map_err(AppError::Git)?;
            let index_tree = index
                .write_tree()
                .and_then(|oid| repo.find_tree(oid))
                .map_err(AppError::Git)?;
            repo.diff_tree_to_tree(head_tree.as_ref(), Some(&index_tree), None)
                .map_err(AppError::Git)?
        }
        AiContextScope::Working => {
            let mut opts = DiffOptions::new();
            opts.include_untracked(true).recurse_untracked_dirs(true);
            repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
                .map_err(AppError::Git)?
        }
        AiContextScope::Range => {
            let base = base_ref.ok_or_else(|| {
                AppError::InvalidInput("A base ref is required for range context".to_string())
            })?;
            let base_commit = repo
                .revparse_single(base)
                .and_then(|obj| obj.peel_to_commit())
                .map_err(|_| {
                    AppError::InvalidInput(format!("Base ref '{base}' could not be resolved"))
                })?;
            let head_commit = repo
                .head()
                .and_then(|h| h.peel_to_commit())
                .map_err(AppError::Git)?;
            let merge_base = repo
                .merge_base(base_commit.id(), head_commit.id())
                .map_err(AppError::Git)?;
            let merge_base_tree = repo
                .find_commit(merge_base)
                .and_then(|c| c.tree())
                .map_err(AppError::Git)?;
            let head_commit_tree = head_commit.tree().map_err(AppError::Git)?;

            resolved_base_ref = Some(base.to_string());
            range_commits = Some(collect_range_commit_subjects(
                &repo,
                merge_base,
                head_commit.id(),
            ));
            repo.diff_tree_to_tree(Some(&merge_base_tree), Some(&head_commit_tree), None)
                .map_err(AppError::Git)?
        }
    };

    let mut files = Vec::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            files.push(AiContextFile {
                path: path.to_string_lossy().to_string(),
                status: status_word(delta.status()).to_string(),
            });
        }
    }

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            _ => " ",
        };
        diff_text.push_str(prefix);
        if let Ok(content) = std::str::from_utf8(line.content()) {
            diff_text.push_str(content);
        }
        true
    })
    .map_err(AppError::Git)?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());

    let repo_name = Path::new(repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| repo_path.to_string());

    let commit_convention = detect_commit_convention(repo_path, &repo);
    let recent_commits = collect_recent_commit_subjects(&repo, 10);

    Ok(AiContext {
        diff: diff_text,
        repo_name,
        branch,
        files,
        commit_convention,
        recent_commits,
        base_ref: resolved_base_ref,
        range_commits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;
    use git2::Oid;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-aictx-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Builds a tree containing exactly `files` (name → contents), via a TreeBuilder so no
    /// worktree/index checkout is needed.
    fn tree_of(repo: &Repository, files: &[(&str, &str)]) -> git2::Oid {
        let mut tb = repo.treebuilder(None).unwrap();
        for (name, content) in files {
            let blob = repo.blob(content.as_bytes()).unwrap();
            tb.insert(name, blob, 0o100644).unwrap();
        }
        tb.write().unwrap()
    }

    fn commit_to(
        repo: &Repository,
        reference: &str,
        msg: &str,
        tree_oid: Oid,
        parents: &[Oid],
    ) -> Oid {
        let sig = get_git_signature(repo).unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let parent_commits: Vec<git2::Commit> = parents
            .iter()
            .map(|p| repo.find_commit(*p).unwrap())
            .collect();
        let parent_refs: Vec<&git2::Commit> = parent_commits.iter().collect();
        repo.commit(Some(reference), &sig, &sig, msg, &tree, &parent_refs)
            .unwrap()
    }

    /// Repo with a base branch (1 commit, `a.txt`) and a `feature` branch (2 more commits touching
    /// `b.txt`). Returns (dir, base branch name). HEAD is left pointing at `feature`.
    fn repo_with_feature_branch(name: &str) -> (std::path::PathBuf, String) {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        let c1 = commit_to(
            &repo,
            "HEAD",
            "init",
            tree_of(&repo, &[("a.txt", "a")]),
            &[],
        );
        let base_name = repo.head().unwrap().shorthand().unwrap().to_string();

        repo.branch("feature", &repo.find_commit(c1).unwrap(), false)
            .unwrap();
        let c2 = commit_to(
            &repo,
            "refs/heads/feature",
            "feat: add b",
            tree_of(&repo, &[("a.txt", "a"), ("b.txt", "b")]),
            &[c1],
        );
        commit_to(
            &repo,
            "refs/heads/feature",
            "feat: update b",
            tree_of(&repo, &[("a.txt", "a"), ("b.txt", "bb")]),
            &[c2],
        );
        repo.set_head("refs/heads/feature").unwrap();
        (dir, base_name)
    }

    #[test]
    fn range_scope_diffs_the_branch_against_its_base() {
        let (dir, base) = repo_with_feature_branch("range-diff");
        let ctx =
            build_ai_context(dir.to_str().unwrap(), AiContextScope::Range, Some(&base)).unwrap();
        assert!(
            ctx.diff.contains("b.txt"),
            "diff should mention the added file"
        );
        assert_eq!(ctx.base_ref.as_deref(), Some(base.as_str()));
        // Two non-merge commits on the branch, base's own commit excluded.
        assert_eq!(
            ctx.range_commits,
            Some(vec![
                "feat: update b".to_string(),
                "feat: add b".to_string()
            ])
        );
        assert!(ctx.files.iter().any(|f| f.path == "b.txt"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn range_scope_requires_a_base_ref() {
        let (dir, _) = repo_with_feature_branch("range-nobase");
        let err = build_ai_context(dir.to_str().unwrap(), AiContextScope::Range, None).unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn range_scope_errors_on_an_unresolvable_base_ref() {
        let (dir, _) = repo_with_feature_branch("range-badbase");
        let err = build_ai_context(
            dir.to_str().unwrap(),
            AiContextScope::Range,
            Some("does-not-exist"),
        )
        .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn staged_scope_leaves_range_fields_empty() {
        let (dir, _) = repo_with_feature_branch("range-staged");
        let ctx = build_ai_context(dir.to_str().unwrap(), AiContextScope::Staged, None).unwrap();
        assert!(ctx.base_ref.is_none());
        assert!(ctx.range_commits.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }
}
