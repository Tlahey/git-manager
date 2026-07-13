use crate::models::AiProviderStatus;
use crate::services::ai_provider::{build_generate_context, GenerateConfig};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateConfig {
    pub protocol: String,
    pub url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub temperature: f32,
    pub timeout_seconds: u64,
    pub system_prompt: Option<String>,
    pub include_repo_context: bool,
    pub auto_detect_scope: bool,
}

impl From<AiGenerateConfig> for GenerateConfig {
    fn from(c: AiGenerateConfig) -> Self {
        GenerateConfig {
            url: c.url,
            model: c.model,
            api_key: c.api_key,
            temperature: c.temperature,
            timeout_seconds: c.timeout_seconds,
            system_prompt: c.system_prompt,
            include_repo_context: c.include_repo_context,
            auto_detect_scope: c.auto_detect_scope,
        }
    }
}

/// Vérifie si le provider AI configuré est disponible et liste les modèles
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
        system_prompt: None,
        include_repo_context: false,
        auto_detect_scope: false,
    };
    provider
        .check_status(&generate_config)
        .await
        .map_err(Into::into)
}

/// Lance la génération d'un message de commit depuis le diff, en streaming
#[tauri::command]
pub async fn generate_commit_message(
    path: String,
    config: AiGenerateConfig,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    *state.generation_cancel.lock().unwrap() = false;

    let context = build_generate_context(&path)?;
    if context.diff.is_empty() {
        return Err("No staged changes".to_string());
    }

    let protocol = config.protocol.clone();
    let provider = provider_for(&protocol);
    let generate_config: GenerateConfig = config.into();

    provider
        .generate(&generate_config, context, &app, &state.generation_cancel)
        .await
        .map_err(Into::into)
}

/// Annule la génération en cours
#[tauri::command]
pub async fn cancel_generation(state: State<'_, AppState>) -> Result<(), String> {
    *state.generation_cancel.lock().unwrap() = true;
    Ok(())
}
