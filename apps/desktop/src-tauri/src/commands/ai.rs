use crate::models::AiProviderStatus;
use crate::services::ai_activity::{build_ai_activity, AiActivity};
use crate::services::ai_context::{build_ai_context, AiContext, AiContextScope};
use crate::services::ai_provider::GenerateConfig;
use crate::services::ai_registry::provider_for;
use crate::state::AppState;
use serde::Deserialize;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCheckConfig {
    pub protocol: String,
    pub url: String,
    pub api_key: Option<String>,
}

/// Wire config for the generic `ai_generate_stream` / `ai_complete` commands. Connection-only plus
/// the per-request `temperature` (chosen by the *feature* in `@git-manager/ai`, not by Settings).
/// The `protocol` selects the provider; there is deliberately no system prompt or prompt-building
/// toggle here — the caller passes fully built `system_prompt`/`user_prompt` strings.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateConfig {
    pub protocol: String,
    pub url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub temperature: f32,
    pub timeout_seconds: u64,
}

impl From<AiGenerateConfig> for GenerateConfig {
    fn from(c: AiGenerateConfig) -> Self {
        GenerateConfig {
            url: c.url,
            model: c.model,
            api_key: c.api_key,
            temperature: c.temperature,
            timeout_seconds: c.timeout_seconds,
        }
    }
}

/// Checks whether the configured AI provider is reachable and lists its models
#[tauri::command]
pub async fn check_ai_status(config: AiCheckConfig) -> Result<AiProviderStatus, String> {
    let provider = provider_for(&config.protocol);
    // check_status only reads url/api_key — the rest of GenerateConfig doesn't apply to a plain
    // connection check, so it's filled with inert placeholders here rather than widening
    // AiCheckConfig (and every call site) with fields that would always be unused.
    let generate_config = GenerateConfig {
        url: config.url,
        model: String::new(),
        api_key: config.api_key,
        temperature: 0.0,
        timeout_seconds: 5,
    };
    provider
        .check_status(&generate_config)
        .await
        .map_err(Into::into)
}

/// Snapshots the repo's uncommitted changes for a feature's prompt (git2 logic lives in the
/// service layer). `scope` is `"staged"` or `"working"`.
#[tauri::command]
pub async fn get_ai_context(path: String, scope: String) -> Result<AiContext, String> {
    build_ai_context(&path, AiContextScope::from_str(&scope)).map_err(Into::into)
}

/// Gathers the recent-activity context (commits authored in the last `since_hours` hours + current
/// uncommitted work) for the daily-summary feature. `since_hours` is computed by the frontend, which
/// knows the local clock and weekend boundaries; the backend stays a pure git query.
#[tauri::command]
pub async fn get_ai_activity(path: String, since_hours: i64) -> Result<AiActivity, String> {
    build_ai_activity(&path, since_hours).map_err(Into::into)
}

/// Generic streaming generation: relays a fully built system/user prompt to the selected provider
/// and streams tokens back via `ai:token`/`ai:done` events. Feature-agnostic — every streaming AI
/// feature (commit message, future report generation, …) goes through this one command.
#[tauri::command]
pub async fn ai_generate_stream(
    config: AiGenerateConfig,
    system_prompt: String,
    user_prompt: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    *state.generation_cancel.lock().unwrap() = false;

    let provider = provider_for(&config.protocol);
    let generate_config: GenerateConfig = config.into();

    provider
        .generate(
            &generate_config,
            &system_prompt,
            &user_prompt,
            &app,
            &state.generation_cancel,
        )
        .await
        .map_err(Into::into)
}

/// Generic non-streaming completion: relays a fully built system/user prompt and returns the full
/// response as a string. Used by features that need a complete, parseable answer (e.g. file→commit
/// grouping) rather than incremental tokens.
#[tauri::command]
pub async fn ai_complete(
    config: AiGenerateConfig,
    system_prompt: String,
    user_prompt: String,
    schema: Option<serde_json::Value>,
) -> Result<String, String> {
    let provider = provider_for(&config.protocol);
    let generate_config: GenerateConfig = config.into();

    provider
        .complete(
            &generate_config,
            &system_prompt,
            &user_prompt,
            schema.as_ref(),
        )
        .await
        .map_err(Into::into)
}

/// Cancels the streaming generation in progress
#[tauri::command]
pub async fn cancel_generation(state: State<'_, AppState>) -> Result<(), String> {
    *state.generation_cancel.lock().unwrap() = true;
    Ok(())
}
