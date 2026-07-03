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
    #[error("Ollama error: {0}")]
    Ollama(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
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
            AppError::Ollama(_) => ("OLLAMA_ERROR", e.to_string()),
            AppError::Http(_) => ("HTTP_ERROR", e.to_string()),
            AppError::Unknown(_) => ("UNKNOWN", e.to_string()),
        };
        serde_json::to_string(&ErrorPayload {
            code: code.to_string(),
            message,
            detail: None,
        })
        .unwrap_or_else(|_| e.to_string())
    }
}
