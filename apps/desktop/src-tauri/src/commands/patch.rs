use crate::services::dependency_patch::{
    self, CommittedDependencyPatch, PatchableDependency, PreparedDependencyPatch,
};
use crate::services::git_patch;

// ─── create_patch ─────────────────────────────────────────────────────────────

/// Writes a `git format-patch`-style patch file for a single commit to `dest_path`.
/// Shells out directly (no git2 equivalent produces the same `git am`-compatible
/// mbox format with commit metadata headers).
#[tauri::command]
pub async fn create_patch(path: String, oid: String, dest_path: String) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["-C", &path, "format-patch", "-1", &oid, "--stdout"])
        .output()
        .map_err(|e| format!("Failed to run git format-patch: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    std::fs::write(&dest_path, &output.stdout)
        .map_err(|e| format!("Failed to write patch file: {e}"))?;

    Ok(())
}

// ─── create_commits_patch ─────────────────────────────────────────────────────

/// Writes a `git am`-compatible patch covering several commits (a multi-selection) to `dest_path`.
/// `oids` must be ordered oldest→newest; each commit's `format-patch -1` mbox is concatenated, so
/// non-contiguous selections work (unlike a single `<base>..<head>` range).
#[tauri::command]
pub async fn create_commits_patch(
    path: String,
    oids: Vec<String>,
    dest_path: String,
) -> Result<(), String> {
    let mut buffer: Vec<u8> = Vec::new();
    for oid in &oids {
        let output = std::process::Command::new("git")
            .args(["-C", &path, "format-patch", "-1", oid, "--stdout"])
            .output()
            .map_err(|e| format!("Failed to run git format-patch: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        buffer.extend_from_slice(&output.stdout);
    }

    std::fs::write(&dest_path, &buffer).map_err(|e| format!("Failed to write patch file: {e}"))?;

    Ok(())
}

// ─── create_working_patch ─────────────────────────────────────────────────────

/// Writes a `git apply`-compatible patch built from the selected working-tree
/// files (staged + unstaged vs HEAD, untracked files as full additions) to
/// `dest_path`.
#[tauri::command]
pub async fn create_working_patch(
    path: String,
    file_paths: Vec<String>,
    dest_path: String,
) -> Result<(), String> {
    let bytes = git_patch::build_working_patch(&path, &file_paths)?;
    std::fs::write(&dest_path, &bytes).map_err(|e| format!("Failed to write patch file: {e}"))?;
    Ok(())
}

// ─── preview_working_patch ────────────────────────────────────────────────────

/// Returns the patch text that `create_working_patch` would write for the given
/// files, so the UI can preview exactly what will be saved (binary hunks are
/// lossily decoded and will look garbled — that is expected for a preview).
#[tauri::command]
pub async fn preview_working_patch(
    path: String,
    file_paths: Vec<String>,
) -> Result<String, String> {
    let bytes = git_patch::build_working_patch(&path, &file_paths)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

// ─── read_patch_file ──────────────────────────────────────────────────────────

/// Reads a patch file's text so the frontend can preview it before applying.
#[tauri::command]
pub async fn read_patch_file(patch_path: String) -> Result<String, String> {
    std::fs::read_to_string(&patch_path).map_err(|e| format!("Failed to read patch file: {e}"))
}

// ─── apply_patch ──────────────────────────────────────────────────────────────

/// Applies a patch file onto the working tree. When `check_only` is set, runs a
/// dry run (`git apply --check`) that reports cleanliness without mutating files.
#[tauri::command]
pub async fn apply_patch(path: String, patch_path: String, check_only: bool) -> Result<(), String> {
    git_patch::apply_patch(&path, &patch_path, check_only)
}

// ─── Dependency (node_modules) patching ───────────────────────────────────────

/// Lists the repo's dependencies (resolved versions + already-patched flag) so
/// the UI can offer node_modules packages to patch.
#[tauri::command]
pub async fn list_patchable_dependencies(path: String) -> Result<Vec<PatchableDependency>, String> {
    dependency_patch::list_patchable_dependencies(&path)
}

/// Prepares a pnpm patch edit dir for a dependency, overlays the live (edited)
/// package onto pristine, and returns the diff for preview.
#[tauri::command]
pub async fn prepare_dependency_patch(
    path: String,
    name: String,
    version: String,
) -> Result<PreparedDependencyPatch, String> {
    dependency_patch::prepare_dependency_patch(&path, &name, &version)
}

/// Finalises a prepared edit dir: writes the patch file and wires
/// `pnpm.patchedDependencies` into `package.json`.
#[tauri::command]
pub async fn commit_dependency_patch(
    path: String,
    edit_dir: String,
) -> Result<CommittedDependencyPatch, String> {
    dependency_patch::commit_dependency_patch(&path, &edit_dir)
}
