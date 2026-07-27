//! Asking Ollama what a model's context window actually is.
//!
//! The app cannot negotiate a context window — no protocol it speaks lets it — so
//! `AiConnectionConfig.contextTokens` is *declared* by the user in Settings and trusted on faith.
//! That trust is load-bearing: features size their prompts from it, and declaring more than the
//! provider serves re-arms the exact silent truncation the setting exists to avoid, only worse,
//! because the app then builds an oversized prompt deliberately.
//!
//! This module removes some of that faith. It is Ollama-only on purpose: `/api/show` and `/api/ps`
//! are Ollama's native API, and no OpenAI-compatible endpoint reports a context length at all.
//!
//! **What it can and cannot tell you** matters more than the number, and the caller must not
//! overstate it:
//!
//! - `architecture_max` (`/api/show`) is the ceiling baked into the model — a hard upper bound.
//!   Declaring more than this is unambiguously wrong.
//! - `modelfile_num_ctx` (`/api/show`) is `num_ctx` if the model's Modelfile pins one. The running
//!   server may still override it, so it is a hint, not a verdict.
//! - `allocated_context` (`/api/ps`) is the window the server *actually allocated* for the model it
//!   currently has loaded. This is the only one of the three that reflects a server-side
//!   `OLLAMA_CONTEXT_LENGTH`, and it is the number a prompt is really measured against — but it only
//!   exists while the model is loaded, and it is undocumented (see [`loaded_context_length`]).
//!
//! So: with `allocated_context` present, a declared window can be checked against what the server
//! will serve. Without it, a value passing the `/api/show` checks is *plausible*, not *verified*.

use crate::error::AppError;
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;

/// What Ollama could tell us about a model's context window. Every field is optional: a provider
/// that is not Ollama, an unknown model, a model that is not loaded, or an unfamiliar payload shape
/// all yield `None` rather than a guess.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContextLimits {
    /// The model architecture's own maximum, in tokens. A hard ceiling.
    pub architecture_max: Option<u32>,
    /// `num_ctx` pinned in the model's Modelfile, when it pins one.
    pub modelfile_num_ctx: Option<u32>,
    /// The window the server allocated for this model, in tokens — present only while it is loaded.
    /// The one number that reflects a server-side `OLLAMA_CONTEXT_LENGTH`.
    pub allocated_context: Option<u32>,
}

/// Strips the OpenAI-compatibility path off a configured URL to get Ollama's own origin.
///
/// Settings holds the URL the *completions* provider uses, which for Ollama is the bare origin and
/// for anything else may carry a `/v1`-ish path. `/api/show` lives at the origin, so a configured
/// `http://localhost:11434/v1` has to lose that segment or the probe 404s.
fn ollama_origin(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    trimmed
        .strip_suffix("/v1")
        .map(str::to_string)
        .unwrap_or_else(|| trimmed.to_string())
}

/// Pulls the architecture's context length out of `model_info`.
///
/// The key is namespaced by architecture (`llama.context_length`, `qwen2.context_length`, …), so it
/// is matched by suffix rather than enumerated — a list of architectures would be stale within a
/// release.
fn architecture_context_length(model_info: &serde_json::Value) -> Option<u32> {
    model_info
        .as_object()?
        .iter()
        .find(|(key, _)| key.ends_with(".context_length"))
        .and_then(|(_, value)| value.as_u64())
        .and_then(|v| u32::try_from(v).ok())
}

/// Parses `num_ctx` out of the newline-separated `parameters` blob (`"num_ctx 8192\nstop ..."`).
fn modelfile_num_ctx(parameters: &str) -> Option<u32> {
    parameters
        .lines()
        .filter_map(|line| line.split_once(char::is_whitespace))
        .find(|(key, _)| key.trim() == "num_ctx")
        .and_then(|(_, value)| value.trim().parse().ok())
}

/// Finds `model` in an `/api/ps` payload and returns the context length the server allocated for it.
///
/// **This field is undocumented.** Ollama's `docs/api.md` shows a `/api/ps` example without it, yet
/// a live 0.32.3 returns `"context_length": 40960` alongside each loaded model. It is exactly what
/// the rest of this module cannot otherwise see — a window set through `OLLAMA_CONTEXT_LENGTH` — so
/// it is worth reading, and worth reading *defensively*: an Ollama that stops sending it, or renames
/// it, must degrade to "unknown" rather than to an error, because the honest answer here has always
/// been allowed to be "we could not find out".
///
/// The match is on the entry's `model`/`name` field. Ollama reports the fully qualified tag
/// (`qwen3:8b`), which is what Settings stores, but a user who typed `qwen3` means the same thing to
/// the completions endpoint — so a bare name matches its `:latest` form too.
fn loaded_context_length(body: &serde_json::Value, model: &str) -> Option<u32> {
    let wanted = model.trim();
    body.get("models")?
        .as_array()?
        .iter()
        .find(|entry| {
            ["model", "name"]
                .iter()
                .filter_map(|key| entry.get(key).and_then(|v| v.as_str()))
                .any(|name| name == wanted || name == format!("{wanted}:latest"))
        })
        .and_then(|entry| entry.get("context_length"))
        .and_then(|v| v.as_u64())
        .and_then(|v| u32::try_from(v).ok())
}

/// A metadata lookup behind a Settings button: a long hang here is worse than "unknown".
const PROBE_TIMEOUT_SECONDS: u64 = 10;

fn probe_client() -> Result<Client, AppError> {
    Client::builder()
        .timeout(Duration::from_secs(PROBE_TIMEOUT_SECONDS))
        .build()
        .map_err(AppError::Http)
}

/// Asks `/api/show` for the two static limits. Returns `(architecture_max, modelfile_num_ctx)`.
async fn fetch_show_limits(
    client: &Client,
    origin: &str,
    model: &str,
) -> Result<(Option<u32>, Option<u32>), AppError> {
    #[derive(Serialize)]
    struct ShowRequest<'a> {
        model: &'a str,
    }

    let response = client
        .post(format!("{origin}/api/show"))
        .json(&ShowRequest { model })
        .send()
        .await?;

    // A non-Ollama provider answers 404 here, which is information, not a failure.
    if !response.status().is_success() {
        return Ok((None, None));
    }

    let body: serde_json::Value = response.json().await?;

    Ok((
        body.get("model_info").and_then(architecture_context_length),
        body.get("parameters")
            .and_then(|p| p.as_str())
            .and_then(modelfile_num_ctx),
    ))
}

/// Asks `/api/ps` what the server has loaded, and with what window.
///
/// Every failure resolves to `None`, not an `Err`: this endpoint is a bonus on top of `/api/show`,
/// and a model that is simply not loaded (`{"models":[]}`) is the *common* case, not a problem. A
/// transport error here would otherwise turn a successful `/api/show` into a red message about a
/// provider that is plainly answering.
async fn fetch_allocated_context(client: &Client, origin: &str, model: &str) -> Option<u32> {
    let response = client.get(format!("{origin}/api/ps")).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().await.ok()?;
    loaded_context_length(&body, model)
}

/// Asks Ollama about `model`. Returns an empty result rather than an error when the provider simply
/// has nothing to say — only a transport failure on `/api/show` is worth surfacing, since "we could
/// not find out" is a normal answer here and must not read as "your provider is down".
pub async fn fetch_model_context_limits(
    url: &str,
    model: &str,
) -> Result<ModelContextLimits, AppError> {
    let client = probe_client()?;
    let origin = ollama_origin(url);

    let (architecture_max, modelfile_num_ctx) = fetch_show_limits(&client, &origin, model).await?;

    Ok(ModelContextLimits {
        architecture_max,
        modelfile_num_ctx,
        allocated_context: fetch_allocated_context(&client, &origin, model).await,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn strips_the_openai_compatibility_path() {
        assert_eq!(
            ollama_origin("http://localhost:11434"),
            "http://localhost:11434"
        );
        assert_eq!(
            ollama_origin("http://localhost:11434/"),
            "http://localhost:11434"
        );
        // The probe would 404 against /v1/api/show.
        assert_eq!(
            ollama_origin("http://localhost:11434/v1"),
            "http://localhost:11434"
        );
        assert_eq!(
            ollama_origin("http://localhost:11434/v1/"),
            "http://localhost:11434"
        );
    }

    #[test]
    fn reads_the_context_length_whatever_the_architecture() {
        // The key is namespaced per architecture, so it cannot be looked up by a fixed name.
        for arch in ["llama", "qwen2", "gemma3", "some-future-arch"] {
            let info = json!({
                format!("{arch}.context_length"): 32768,
                format!("{arch}.embedding_length"): 4096,
                "general.architecture": arch,
            });
            assert_eq!(architecture_context_length(&info), Some(32768));
        }
    }

    #[test]
    fn reports_nothing_when_the_payload_has_no_context_length() {
        assert_eq!(
            architecture_context_length(&json!({ "general.architecture": "llama" })),
            None
        );
        assert_eq!(architecture_context_length(&json!("not an object")), None);
    }

    #[test]
    fn reads_num_ctx_from_the_modelfile_parameters() {
        assert_eq!(
            modelfile_num_ctx("num_ctx                8192\nstop \"<|im_end|>\""),
            Some(8192)
        );
        assert_eq!(
            modelfile_num_ctx("stop \"<|im_end|>\"\nnum_ctx 4096"),
            Some(4096)
        );
    }

    #[test]
    fn reports_no_num_ctx_when_the_modelfile_pins_none() {
        assert_eq!(
            modelfile_num_ctx("stop \"<|im_end|>\"\ntemperature 0.7"),
            None
        );
        assert_eq!(modelfile_num_ctx(""), None);
        // A key that merely starts with num_ctx is not num_ctx.
        assert_eq!(modelfile_num_ctx("num_ctx_extra 999"), None);
    }

    /// Shape observed from a live Ollama 0.32.3 — `context_length` included, which the published
    /// `/api/ps` example omits.
    fn ps_payload(name: &str, context_length: serde_json::Value) -> serde_json::Value {
        json!({
            "models": [{
                "name": name,
                "model": name,
                "size": 6_000_000_000u64,
                "digest": "abc123",
                "context_length": context_length,
            }]
        })
    }

    #[test]
    fn reads_the_allocated_window_of_a_loaded_model() {
        // The whole point: this is the only field that reflects a server-side OLLAMA_CONTEXT_LENGTH.
        let body = ps_payload("qwen3:8b", json!(40960));
        assert_eq!(loaded_context_length(&body, "qwen3:8b"), Some(40960));
    }

    #[test]
    fn matches_a_bare_model_name_against_its_latest_tag() {
        // A user who typed `llama3.2` in Settings reaches the same model the completions endpoint
        // does; /api/ps reports it fully qualified.
        let body = ps_payload("llama3.2:latest", json!(8192));
        assert_eq!(loaded_context_length(&body, "llama3.2"), Some(8192));
        assert_eq!(loaded_context_length(&body, "llama3.2:latest"), Some(8192));
        assert_eq!(loaded_context_length(&body, "llama3.2:1b"), None);
    }

    #[test]
    fn reports_nothing_when_no_model_is_loaded() {
        // The common case, and emphatically not an error: nothing is loaded until something runs.
        assert_eq!(
            loaded_context_length(&json!({ "models": [] }), "qwen3:8b"),
            None
        );
    }

    #[test]
    fn degrades_to_unknown_when_the_undocumented_field_is_absent_or_odd() {
        // `context_length` is undocumented, so an Ollama that drops or retypes it must read as
        // "we could not find out" rather than break the check.
        let no_field = json!({ "models": [{ "name": "qwen3:8b", "size": 1 }] });
        assert_eq!(loaded_context_length(&no_field, "qwen3:8b"), None);
        assert_eq!(
            loaded_context_length(&ps_payload("qwen3:8b", json!("40960")), "qwen3:8b"),
            None
        );
        assert_eq!(loaded_context_length(&json!({}), "qwen3:8b"), None);
        assert_eq!(loaded_context_length(&json!("nonsense"), "qwen3:8b"), None);
    }
}
