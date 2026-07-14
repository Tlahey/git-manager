use crate::error::AppError;
use crate::models::AiProviderStatus;
use async_trait::async_trait;
use std::sync::Mutex;
use tauri::AppHandle;

/// Per-call connection + sampling configuration, built fresh from the frontend's request on every
/// call rather than synced into `AppState` ahead of time, so there's no stale-global-state class of
/// bug to worry about (a prior version kept a `Mutex<OllamaConfig>` in `AppState` that was never
/// updated after its hardcoded default — every setting except `model` was silently ignored).
///
/// Note what's *not* here: no system prompt, no prompt-building toggles. The provider is a dumb
/// transport — it receives a fully built `system_prompt`/`user_prompt` pair from the caller (the
/// TS `@git-manager/ai` package owns instructions and prompt construction). `temperature` is the
/// only "what to ask" knob it sees, and even that is chosen per-feature by the package, not by the
/// app's Settings.
#[derive(Debug, Clone)]
pub struct GenerateConfig {
    pub url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub temperature: f32,
    pub timeout_seconds: u64,
}

/// One implementation per wire protocol (not per user-facing preset — see `AiPresetId` in
/// `@git-manager/ai`, where e.g. Ollama/LM Studio/OpenAI all resolve to the same
/// `openai-compatible` protocol and therefore the same provider implementation). Adding a new
/// provider means adding a new file implementing this trait and one line in `provider_for` —
/// existing providers never need to change. Adding a new *feature* needs none of this: features
/// live entirely in the TS package and reuse `generate`/`complete`.
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn check_status(&self, config: &GenerateConfig) -> Result<AiProviderStatus, AppError>;

    /// Streams tokens via `app.emit("ai:token", ...)`, finishing with `app.emit("ai:done", ())`,
    /// or `app.emit("ai:cancelled", ())` if `cancel` flips true mid-stream. Returning `Err` lets
    /// the caller also emit `ai:error` with the message.
    async fn generate(
        &self,
        config: &GenerateConfig,
        system_prompt: &str,
        user_prompt: &str,
        app: &AppHandle,
        cancel: &Mutex<bool>,
    ) -> Result<(), AppError>;

    /// Non-streaming counterpart: returns the model's full response as a single string. Used by
    /// features that need a complete, parseable answer (e.g. a JSON file→commit grouping) rather
    /// than incremental tokens. When `schema` is `Some`, the provider constrains the model to that
    /// JSON Schema (structured output) so the response is reliably parseable.
    async fn complete(
        &self,
        config: &GenerateConfig,
        system_prompt: &str,
        user_prompt: &str,
        schema: Option<&serde_json::Value>,
    ) -> Result<String, AppError>;
}
