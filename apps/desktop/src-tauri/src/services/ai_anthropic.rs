use super::ai_provider::{AiProvider, GenerateConfig, GenerateContext};
use crate::error::AppError;
use crate::models::AiProviderStatus;
use async_trait::async_trait;
use std::sync::Mutex;
use tauri::AppHandle;

/// Anthropic's Messages API (`/v1/messages`) has a genuinely different request/response shape
/// from the OpenAI Chat Completions surface (different auth header, different streaming event
/// framing, no `/v1/models` equivalent in the same form) — unlike Ollama/LM Studio/OpenAI, it
/// can't share `OpenAiCompatibleProvider`. This stub exists so the registry and Settings UI
/// wiring for the "anthropic" preset are real today; the actual integration is future work (see
/// `AI_PRESETS`'s `implemented: false` for this preset in `packages/ai`).
pub struct AnthropicProvider;

#[async_trait]
impl AiProvider for AnthropicProvider {
    async fn check_status(&self, _config: &GenerateConfig) -> Result<AiProviderStatus, AppError> {
        Err(AppError::AiProvider(
            "Anthropic provider not yet implemented".to_string(),
        ))
    }

    async fn generate(
        &self,
        _config: &GenerateConfig,
        _context: GenerateContext,
        _app: &AppHandle,
        _cancel: &Mutex<bool>,
    ) -> Result<(), AppError> {
        Err(AppError::AiProvider(
            "Anthropic provider not yet implemented".to_string(),
        ))
    }
}
