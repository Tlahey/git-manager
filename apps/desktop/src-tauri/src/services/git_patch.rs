//! Working-tree patch generation and application.
//!
//! Shells out to `git diff` / `git apply` directly rather than using `git2`:
//! libgit2 has no equivalent that produces a byte-identical, `git apply`-compatible
//! unified diff (with binary hunks and rename/new-file headers), and `git apply`
//! is the canonical, most permissive way to replay one back onto the working tree —
//! including onto ignored paths such as `node_modules/*`, which `git apply` happily
//! patches even though they never appear in the index.

use std::process::Command;

/// Returns true when `file` is not tracked by git (never added to the index).
///
/// `git ls-files --error-unmatch` exits non-zero for an untracked path, which lets
/// us route brand-new files through `--no-index` below instead of `diff HEAD`
/// (which would emit nothing for a path that HEAD has never heard of).
fn is_untracked(repo_path: &str, file: &str) -> bool {
    Command::new("git")
        .args(["-C", repo_path, "ls-files", "--error-unmatch", "--", file])
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(false)
}

/// Builds a unified diff for the given `files` relative to `HEAD`, covering both
/// staged and unstaged changes in one patch. Untracked files are emitted as
/// full-file additions via `--no-index` so a fresh file still round-trips.
///
/// The result is `git apply`-compatible bytes (binary hunks preserved), ready to
/// write to a `.patch` file.
pub fn build_working_patch(repo_path: &str, files: &[String]) -> Result<Vec<u8>, String> {
    if files.is_empty() {
        return Err("No files selected for the patch".to_string());
    }

    let mut tracked: Vec<&str> = Vec::new();
    let mut untracked: Vec<&str> = Vec::new();
    for file in files {
        if is_untracked(repo_path, file) {
            untracked.push(file);
        } else {
            tracked.push(file);
        }
    }

    let mut out: Vec<u8> = Vec::new();

    if !tracked.is_empty() {
        let mut args = vec!["-C", repo_path, "diff", "--binary", "HEAD", "--"];
        args.extend(tracked.iter().copied());
        let output = Command::new("git")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run git diff: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        out.extend_from_slice(&output.stdout);
    }

    for file in untracked {
        // `git diff --no-index` exits with code 1 when the two inputs differ (which
        // they always do here — `/dev/null` vs a real file), so success is *not* a
        // reliable signal; a genuine error exits with code >= 2. Treat only a missing
        // stdout as a failure.
        let output = Command::new("git")
            .args([
                "-C",
                repo_path,
                "diff",
                "--binary",
                "--no-index",
                "--",
                "/dev/null",
                file,
            ])
            .output()
            .map_err(|e| format!("Failed to run git diff for {file}: {e}"))?;
        if output.stdout.is_empty() && !output.stderr.is_empty() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        out.extend_from_slice(&output.stdout);
    }

    if out.is_empty() {
        return Err("Selected files have no changes to capture".to_string());
    }

    Ok(out)
}

/// Applies `patch_path` onto the working tree at `repo_path`. When `check_only`
/// is set, runs `git apply --check` (a dry run that reports whether the patch
/// would apply cleanly without touching any file).
pub fn apply_patch(repo_path: &str, patch_path: &str, check_only: bool) -> Result<(), String> {
    let mut args = vec!["-C", repo_path, "apply"];
    if check_only {
        args.push("--check");
    }
    args.push("--whitespace=nowarn");
    args.push("--");
    args.push(patch_path);

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git apply: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn run_git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .status()
            .unwrap()
            .success();
        assert!(ok, "git {args:?} failed");
    }

    /// Temp repo with one committed file `a.txt` containing `one\n`.
    fn init_repo(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("gm-test-patch-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        run_git(&dir, &["init", "-q"]);
        run_git(&dir, &["config", "user.email", "t@t"]);
        run_git(&dir, &["config", "user.name", "t"]);
        run_git(&dir, &["config", "commit.gpgsign", "false"]);
        fs::write(dir.join("a.txt"), "one\n").unwrap();
        run_git(&dir, &["add", "."]);
        run_git(&dir, &["commit", "-qm", "init"]);
        dir
    }

    #[test]
    fn build_working_patch_captures_tracked_modification() {
        let dir = init_repo("tracked");
        fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
        let bytes = build_working_patch(dir.to_str().unwrap(), &["a.txt".to_string()]).unwrap();
        let patch = String::from_utf8_lossy(&bytes);
        assert!(patch.contains("diff --git a/a.txt b/a.txt"));
        assert!(patch.contains("+two"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn build_working_patch_emits_untracked_as_new_file() {
        let dir = init_repo("untracked");
        fs::write(dir.join("new.txt"), "hello\n").unwrap();
        let bytes = build_working_patch(dir.to_str().unwrap(), &["new.txt".to_string()]).unwrap();
        let patch = String::from_utf8_lossy(&bytes);
        assert!(patch.contains("new file"));
        assert!(patch.contains("+hello"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn build_working_patch_rejects_empty_selection() {
        let dir = init_repo("empty");
        assert!(build_working_patch(dir.to_str().unwrap(), &[]).is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn apply_patch_round_trips_a_generated_patch() {
        let dir = init_repo("round-trip");
        let a = dir.join("a.txt");
        fs::write(&a, "one\ntwo\n").unwrap();
        let bytes = build_working_patch(dir.to_str().unwrap(), &["a.txt".to_string()]).unwrap();
        let patch = dir.join("change.patch");
        fs::write(&patch, &bytes).unwrap();

        // Revert the file, then a dry run should pass and the real apply should restore it.
        run_git(&dir, &["checkout", "--", "a.txt"]);
        assert_eq!(fs::read_to_string(&a).unwrap(), "one\n");
        apply_patch(dir.to_str().unwrap(), patch.to_str().unwrap(), true).unwrap();
        apply_patch(dir.to_str().unwrap(), patch.to_str().unwrap(), false).unwrap();
        assert_eq!(fs::read_to_string(&a).unwrap(), "one\ntwo\n");
        fs::remove_dir_all(&dir).ok();
    }
}
