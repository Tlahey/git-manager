use crate::error::AppError;
use crate::models::AiProviderStatus;
use async_trait::async_trait;
use git2::Repository;
use std::path::Path;
use std::sync::Mutex;
use tauri::AppHandle;

/// Per-call configuration a provider needs — built fresh from the frontend's settings on every
/// `generate_commit_message`/`check_ai_status` call rather than synced into `AppState` ahead of
/// time, so there's no stale-global-state class of bug to worry about (a prior version of this
/// code kept a `Mutex<OllamaConfig>` in `AppState` that was never updated after its hardcoded
/// default — every setting except `model` was silently ignored).
#[derive(Debug, Clone)]
pub struct GenerateConfig {
    pub url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub temperature: f32,
    pub timeout_seconds: u64,
    pub system_prompt: Option<String>,
    pub include_repo_context: bool,
    pub auto_detect_scope: bool,
}

/// Everything about the repo's current state a provider's prompt might need — built once per
/// `generate_commit_message` call by [`build_generate_context`], independent of which provider
/// ends up using it.
pub struct GenerateContext {
    pub diff: String,
    pub repo_name: String,
    pub branch: String,
    pub changed_paths: Vec<String>,
}

/// One implementation per wire protocol (not per user-facing preset — see `AiPresetId` in
/// `@git-manager/ai`, where e.g. Ollama/LM Studio/OpenAI all resolve to the same
/// `openai-compatible` protocol and therefore the same provider implementation). Adding a new
/// provider means adding a new file implementing this trait and one line in
/// [`provider_for`] — existing providers never need to change.
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn check_status(&self, config: &GenerateConfig) -> Result<AiProviderStatus, AppError>;

    /// Streams tokens via `app.emit("ai:token", ...)`, finishing with `app.emit("ai:done", ())`,
    /// or `app.emit("ai:cancelled", ())` if `cancel` flips true mid-stream. Returning `Err` lets
    /// the caller also emit `ai:error` with the message.
    async fn generate(
        &self,
        config: &GenerateConfig,
        context: GenerateContext,
        app: &AppHandle,
        cancel: &Mutex<bool>,
    ) -> Result<(), AppError>;
}

/// Builds the user-turn prompt: optional repo-context line, optional detected-scope hint, then
/// the (possibly truncated) diff. Shared across every provider so prompt construction lives in
/// exactly one place regardless of how many wire protocols exist.
pub fn build_user_prompt(config: &GenerateConfig, context: &GenerateContext) -> String {
    let mut prefix = String::new();

    if config.include_repo_context {
        prefix.push_str(&format!(
            "Repository: {} (branch: {})\n",
            context.repo_name, context.branch
        ));
    }

    if config.auto_detect_scope {
        if let Some(scope) = detect_scope(&context.changed_paths) {
            prefix.push_str(&format!("Suggested scope: {}\n", scope));
        }
    }

    format!(
        "{}Analyze the following Git diff and generate a commit message:\n\n--- DIFF ---\n{}\n--- END DIFF ---",
        prefix,
        truncate_diff(&context.diff, 4000)
    )
}

/// Mirrors the "group by first path segment" heuristic already shipped for batch-commit grouping
/// (`useWipCommitPanel.ts`'s `wipBatches`) — if every changed file shares the same top-level
/// directory, that's a reasonable scope hint; if they span multiple, leave it to the model rather
/// than forcing a misleading scope.
fn detect_scope(paths: &[String]) -> Option<String> {
    let mut segments = paths.iter().filter_map(|p| p.split('/').next());
    let first = segments.next()?;
    if segments.all(|s| s == first) {
        Some(first.to_string())
    } else {
        None
    }
}

fn truncate_diff(diff: &str, max_chars: usize) -> String {
    if diff.len() <= max_chars {
        diff.to_string()
    } else {
        format!(
            "{}\n\n[diff truncated, showing first {} chars]",
            &diff[..max_chars],
            max_chars
        )
    }
}

/// Opens the repo once and gathers everything a provider's prompt might need: the staged diff as
/// plain text, the repo's directory name, the current branch's short name, and the list of
/// changed file paths (for scope detection) — independent of which provider ends up using it.
pub fn build_generate_context(repo_path: &str) -> Result<GenerateContext, AppError> {
    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut index = repo.index().map_err(AppError::Git)?;
    let index_tree = index
        .write_tree()
        .and_then(|oid| repo.find_tree(oid))
        .map_err(AppError::Git)?;

    let diff = repo
        .diff_tree_to_tree(head_tree.as_ref(), Some(&index_tree), None)
        .map_err(AppError::Git)?;

    let mut changed_paths = Vec::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            changed_paths.push(path.to_string_lossy().to_string());
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

    Ok(GenerateContext {
        diff: diff_text,
        repo_name,
        branch,
        changed_paths,
    })
}
