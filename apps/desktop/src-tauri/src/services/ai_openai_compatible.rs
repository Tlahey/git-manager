use super::ai_provider::{AiProvider, GenerateConfig};
use crate::error::AppError;
use crate::models::AiProviderStatus;
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// One implementation covers every preset whose backend speaks the OpenAI Chat Completions API
/// (`/v1/chat/completions` + `/v1/models`) — Ollama has supported this surface since v0.1.14
/// alongside its native API, and LM Studio / real OpenAI / most local MLX servers speak it
/// natively. Only Anthropic's Messages API needs a separate implementation (`ai_anthropic.rs`).
pub struct OpenAiCompatibleProvider;

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionsRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<ResponseFormat>,
}

/// OpenAI structured-output envelope: `{ "type": "json_schema", "json_schema": { name, schema,
/// strict } }`. The inner value is exactly what the feature declared in `@git-manager/ai`
/// (`FILE_GROUPING_SCHEMA`), passed straight through.
#[derive(Debug, Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: &'static str,
    json_schema: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionsChunk {
    choices: Vec<ChatCompletionsChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionsChoice {
    delta: ChatCompletionsDelta,
}

#[derive(Debug, Default, Deserialize)]
struct ChatCompletionsDelta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionsResponse {
    choices: Vec<ChatCompletionsMessageChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionsMessageChoice {
    message: ChatCompletionsMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionsMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

/// Resolves the API base that `/models` and `/chat/completions` hang off.
///
/// A configured URL that already carries a path is taken at face value — `http://localhost:8000/v1`
/// is exactly the "base URL" an OpenAI SDK would be handed, and versioned prefixes vary between
/// servers (`/v1`, `/openai/v1`, `/v1beta/openai`), so guessing is worse than obeying. A bare origin
/// (`http://localhost:11434`) gets the conventional `/v1` appended, which keeps Ollama's zero-config
/// default working without the user having to know the convention.
fn api_base(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let after_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    if after_scheme.contains('/') {
        trimmed.to_string()
    } else {
        format!("{trimmed}/v1")
    }
}

fn models_url(config: &GenerateConfig) -> String {
    format!("{}/models", api_base(&config.url))
}

fn completions_url(config: &GenerateConfig) -> String {
    format!("{}/chat/completions", api_base(&config.url))
}

fn client_for(config: &GenerateConfig) -> Result<Client, AppError> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(config.timeout_seconds))
        .build()
        .map_err(AppError::Http)
}

fn with_auth(builder: reqwest::RequestBuilder, config: &GenerateConfig) -> reqwest::RequestBuilder {
    match &config.api_key {
        Some(key) if !key.is_empty() => builder.bearer_auth(key),
        _ => builder,
    }
}

fn messages(system_prompt: &str, user_prompt: &str) -> Vec<ChatMessage> {
    vec![
        ChatMessage {
            role: "system",
            content: system_prompt.to_string(),
        },
        ChatMessage {
            role: "user",
            content: user_prompt.to_string(),
        },
    ]
}

/// Maps a transport-level `reqwest` error to a stable `AppError` the frontend can localize —
/// connection refused becomes `AI_PROVIDER_NOT_RUNNING`, everything else surfaces its message.
fn send_error(e: reqwest::Error) -> AppError {
    AppError::AiProvider(if e.is_connect() {
        "AI_PROVIDER_NOT_RUNNING".to_string()
    } else {
        e.to_string()
    })
}

/// Maps a non-2xx HTTP status to a stable `AppError` (404 → model-not-found).
fn status_error(status: reqwest::StatusCode) -> AppError {
    if status.as_u16() == 404 {
        AppError::AiProvider("AI_MODEL_NOT_FOUND".to_string())
    } else {
        AppError::AiProvider(format!("HTTP {}", status))
    }
}

#[async_trait]
impl AiProvider for OpenAiCompatibleProvider {
    async fn check_status(&self, config: &GenerateConfig) -> Result<AiProviderStatus, AppError> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(AppError::Http)?;

        let url = models_url(config);
        let request = with_auth(client.get(&url), config);

        // Every failure resolves to a `connected: false` status carrying *why*, rather than an Err:
        // an unreachable provider is an expected condition here, and the reason is the whole point
        // of the check. The detail always names the exact URL that was probed, which is what tells
        // a user their base URL is missing (or duplicating) the `/v1` segment.
        let failed = |detail: String| AiProviderStatus {
            connected: false,
            models: vec![],
            version: None,
            detail: Some(detail),
        };

        match request.send().await {
            Ok(resp) if resp.status().is_success() => match resp.json::<ModelsResponse>().await {
                Ok(data) => Ok(AiProviderStatus {
                    connected: true,
                    models: data.data.into_iter().map(|m| m.id).collect(),
                    version: None,
                    detail: None,
                }),
                Err(e) => Ok(failed(format!(
                    "GET {url} → 200, but the body is not an OpenAI model list ({e})"
                ))),
            },
            Ok(resp) => Ok(failed(format!("GET {url} → HTTP {}", resp.status()))),
            Err(e) if e.is_connect() => Ok(failed(format!("GET {url} → no server answered"))),
            Err(e) if e.is_timeout() => Ok(failed(format!("GET {url} → timed out after 5s"))),
            Err(e) => Ok(failed(format!("GET {url} → {e}"))),
        }
    }

    async fn generate(
        &self,
        config: &GenerateConfig,
        system_prompt: &str,
        user_prompt: &str,
        app: &AppHandle,
        cancel: &Mutex<bool>,
    ) -> Result<(), AppError> {
        let client = client_for(config)?;

        let request = ChatCompletionsRequest {
            model: config.model.clone(),
            messages: messages(system_prompt, user_prompt),
            temperature: config.temperature,
            stream: true,
            response_format: None,
        };

        let completions_url = completions_url(config);

        let resp = with_auth(client.post(&completions_url), config)
            .json(&request)
            .send()
            .await
            .map_err(send_error)?;

        if !resp.status().is_success() {
            return Err(status_error(resp.status()));
        }

        let mut stream = resp.bytes_stream();
        let mut buffered_line = String::new();

        while let Some(chunk) = stream.next().await {
            if *cancel.lock().unwrap() {
                let _ = app.emit("ai:cancelled", ());
                return Ok(());
            }

            let bytes = chunk.map_err(AppError::Http)?;
            let Ok(text) = std::str::from_utf8(&bytes) else {
                continue;
            };
            buffered_line.push_str(text);

            // SSE frames are newline-delimited "data: {...}" lines — process whole lines only,
            // a chunk boundary can land mid-line.
            while let Some(newline_pos) = buffered_line.find('\n') {
                let line = buffered_line[..newline_pos].trim().to_string();
                buffered_line.drain(..=newline_pos);

                let Some(payload) = line.strip_prefix("data:") else {
                    continue;
                };
                let payload = payload.trim();

                if payload == "[DONE]" {
                    let _ = app.emit("ai:done", ());
                    return Ok(());
                }

                if let Ok(parsed) = serde_json::from_str::<ChatCompletionsChunk>(payload) {
                    if let Some(choice) = parsed.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            let _ = app.emit("ai:token", content);
                        }
                    }
                }
            }
        }

        let _ = app.emit("ai:done", ());
        Ok(())
    }

    async fn complete(
        &self,
        config: &GenerateConfig,
        system_prompt: &str,
        user_prompt: &str,
        schema: Option<&serde_json::Value>,
    ) -> Result<String, AppError> {
        let client = client_for(config)?;

        let request = ChatCompletionsRequest {
            model: config.model.clone(),
            messages: messages(system_prompt, user_prompt),
            temperature: config.temperature,
            stream: false,
            response_format: schema.map(|s| ResponseFormat {
                format_type: "json_schema",
                json_schema: s.clone(),
            }),
        };

        let completions_url = completions_url(config);

        let resp = with_auth(client.post(&completions_url), config)
            .json(&request)
            .send()
            .await
            .map_err(send_error)?;

        if !resp.status().is_success() {
            return Err(status_error(resp.status()));
        }

        let parsed: ChatCompletionsResponse = resp.json().await.map_err(AppError::Http)?;
        Ok(parsed
            .choices
            .into_iter()
            .next()
            .and_then(|c| c.message.content)
            .unwrap_or_default())
    }
}

#[cfg(test)]
mod tests {
    use super::api_base;

    #[test]
    fn appends_v1_to_a_bare_origin() {
        assert_eq!(
            api_base("http://localhost:11434"),
            "http://localhost:11434/v1"
        );
        assert_eq!(
            api_base("http://localhost:8000/"),
            "http://localhost:8000/v1"
        );
        assert_eq!(
            api_base("  https://api.openai.com  "),
            "https://api.openai.com/v1"
        );
    }

    #[test]
    fn honours_a_base_url_that_already_carries_a_path() {
        // The case that sent users in circles: typing the base URL an OpenAI SDK expects must not
        // produce /v1/v1/models.
        assert_eq!(
            api_base("http://localhost:8000/v1"),
            "http://localhost:8000/v1"
        );
        assert_eq!(
            api_base("http://localhost:8000/v1/"),
            "http://localhost:8000/v1"
        );
        assert_eq!(api_base("https://host/openai/v1"), "https://host/openai/v1");
        assert_eq!(
            api_base("https://host/v1beta/openai"),
            "https://host/v1beta/openai"
        );
    }

    #[test]
    fn tolerates_a_missing_scheme() {
        assert_eq!(api_base("localhost:8000"), "localhost:8000/v1");
        assert_eq!(api_base("localhost:8000/v1"), "localhost:8000/v1");
    }
}
