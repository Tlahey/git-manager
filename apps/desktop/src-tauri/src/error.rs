use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Repository not found: {0}")]
    RepoNotFound(String),
    #[error("Branch not found: {0}")]
    BranchNotFound(String),
    #[error("Commit not found: {0}")]
    CommitNotFound(String),
    #[error("Protected branch: {0}")]
    ProtectedBranch(String),
    #[error("Tag already exists: {0}")]
    TagAlreadyExists(String),
    #[error("Worktree path already exists: {0}")]
    WorktreePathExists(String),
    #[error("Conflict not found for path: {0}")]
    ConflictNotFound(String),
    #[error("Unparseable conflict: {0}")]
    UnparseableConflict(String),
    /// A repository hook exited non-zero and stopped the operation it was gating.
    ///
    /// Its own variant, carrying the hook's own output, because that output *is* the error message
    /// as far as the user is concerned — "pre-commit failed" tells them nothing, and the three
    /// lines the hook printed tell them everything. Everything else here reports what went wrong
    /// with git; this reports what the user's own tooling decided.
    #[error("The {name} hook stopped the operation")]
    HookFailed { name: String, output: Vec<String> },
    #[error("AI provider error: {0}")]
    AiProvider(String),
    /// The provider accepted the request and then took longer than the configured budget.
    ///
    /// Its own variant because it is the one provider failure the user can act on, and because
    /// reqwest reports it as the thoroughly unhelpful "error decoding response body" when a *read*
    /// timeout fires mid-body — indistinguishable, as a string, from a malformed response. Carries
    /// the budget so the message can name the number to raise.
    #[error("AI request timed out after {0}s")]
    AiTimeout(u64),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Notification error: {0}")]
    NotificationFailed(String),
    #[error("Unknown error: {0}")]
    Unknown(String),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        let (code, message) = match &e {
            AppError::Git(_) => ("GIT_ERROR", e.to_string()),
            AppError::Io(_) => ("IO_ERROR", e.to_string()),
            AppError::RepoNotFound(_) => ("REPO_NOT_FOUND", e.to_string()),
            AppError::BranchNotFound(_) => ("BRANCH_NOT_FOUND", e.to_string()),
            AppError::CommitNotFound(_) => ("COMMIT_NOT_FOUND", e.to_string()),
            AppError::ProtectedBranch(_) => ("PROTECTED_BRANCH", e.to_string()),
            AppError::TagAlreadyExists(_) => ("TAG_ALREADY_EXISTS", e.to_string()),
            AppError::WorktreePathExists(_) => ("WORKTREE_PATH_EXISTS", e.to_string()),
            AppError::ConflictNotFound(_) => ("CONFLICT_NOT_FOUND", e.to_string()),
            AppError::UnparseableConflict(_) => ("UNPARSEABLE_CONFLICT", e.to_string()),
            AppError::AiProvider(_) => ("AI_PROVIDER_ERROR", e.to_string()),
            AppError::AiTimeout(_) => ("AI_TIMEOUT", e.to_string()),
            AppError::InvalidInput(_) => ("INVALID_INPUT", e.to_string()),
            AppError::Http(_) => ("HTTP_ERROR", e.to_string()),
            AppError::NotificationFailed(_) => ("NOTIFICATION_FAILED", e.to_string()),
            AppError::HookFailed { .. } => ("HOOK_FAILED", e.to_string()),
            AppError::Unknown(_) => ("UNKNOWN", e.to_string()),
        };
        // The hook's own output travels in `detail`, which is the field the frontend already
        // reserves for "the long version". Joined with newlines rather than sent as an array
        // because `detail` is a string on both sides, and the consumer splits it back.
        let detail = match &e {
            AppError::HookFailed { output, .. } if !output.is_empty() => Some(output.join("\n")),
            _ => None,
        };
        serde_json::to_string(&ErrorPayload {
            code: code.to_string(),
            message,
            detail,
        })
        .unwrap_or_else(|_| e.to_string())
    }
}
