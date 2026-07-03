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
