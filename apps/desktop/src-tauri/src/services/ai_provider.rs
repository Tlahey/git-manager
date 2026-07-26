use crate::error::AppError;
use crate::models::AiProviderStatus;
use async_trait::async_trait;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

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

/// Payload of every `ai:*` streaming event.
///
/// The `request_id` is the point. Without it these events are broadcasts: `ai:token` reached every
/// listener in the window, so two generations running at once fed each other's text into each
/// other's panel, and a `ai:done` from either one ended both. Every listener now filters on the id
/// it minted, which turns a shared channel into per-request ones without a channel per request.
///
/// `token` is unset on the lifecycle events (`ai:done`, `ai:cancelled`) — they carry only identity.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEvent {
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// One generation's channel back to the frontend: emits its events already tagged with the request
/// id, and answers whether that generation has been cancelled.
///
/// It exists so a provider *cannot* emit an untagged event — the previous shape handed providers a
/// bare `AppHandle` and a bare cancel flag and trusted each implementation to pair them correctly.
/// Bundling them means a new provider gets the protocol right by construction, which matters
/// because the failure mode is not a compile error but two features quietly crosstalking.
pub struct StreamHandle {
    app: AppHandle,
    request_id: String,
    cancel: Arc<AtomicBool>,
}

impl StreamHandle {
    pub fn new(app: AppHandle, request_id: String, cancel: Arc<AtomicBool>) -> Self {
        Self {
            app,
            request_id,
            cancel,
        }
    }

    /// True once `cancel_generation` has been called for *this* request id. Polled between chunks.
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// One token of the model's answer.
    pub fn token(&self, token: &str) {
        self.emit("ai:token", Some(token.to_string()));
    }

    /// The stream finished on its own.
    pub fn done(&self) {
        self.emit("ai:done", None);
    }

    /// The stream stopped because this generation was cancelled.
    pub fn cancelled(&self) {
        self.emit("ai:cancelled", None);
    }

    /// Emission is best-effort: a closed window is a normal way for this to fail, and there is
    /// nothing useful to do about it from inside a provider's read loop.
    fn emit(&self, event: &str, token: Option<String>) {
        let _ = self.app.emit(
            event,
            AiStreamEvent {
                request_id: self.request_id.clone(),
                token,
            },
        );
    }
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

    /// Streams tokens through `stream.token(...)`, finishing with `stream.done()` — or
    /// `stream.cancelled()` if `stream.is_cancelled()` flips true mid-read. Every event it emits is
    /// tagged with the caller's request id by {@link StreamHandle}, so a provider never handles the
    /// id itself.
    ///
    /// **Failures are reported by returning `Err`, not by an event.** The `invoke` promise behind
    /// this command is already per-request and already rejects with the message, so an `ai:error`
    /// event would be a second channel for one condition — and the two would race. An earlier
    /// version of this contract promised such an event; nothing ever emitted it, and three
    /// frontend listeners waited on it for months.
    async fn generate(
        &self,
        config: &GenerateConfig,
        system_prompt: &str,
        user_prompt: &str,
        stream: &StreamHandle,
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
