//! Asking Ollama what a model's context window actually is.
//!
//! The app cannot negotiate a context window — no protocol it speaks lets it — so
//! `AiConnectionConfig.contextTokens` is *declared* by the user in Settings and trusted on faith.
//! That trust is load-bearing: features size their prompts from it, and declaring more than the
//! provider serves re-arms the exact silent truncation the setting exists to avoid, only worse,
//! because the app then builds an oversized prompt deliberately.
//!
//! This module removes some of that faith. It is Ollama-only on purpose: `/api/show` is Ollama's
//! native API, and no OpenAI-compatible endpoint reports a context length at all.
//!
//! **What it can and cannot tell you** matters more than the number, and the caller must not
//! overstate it:
//!
//! - `architecture_max` is the ceiling baked into the model — a hard upper bound. Declaring more
//!   than this is unambiguously wrong.
//! - `modelfile_num_ctx` is `num_ctx` if the model's Modelfile pins one.
//! - Neither reveals a window set through the `OLLAMA_CONTEXT_LENGTH` environment variable, which is
//!   server-side and invisible here. So a value passing these checks is *plausible*, not *verified*.

use crate::error::AppError;
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;

/// What `/api/show` could tell us about a model's context window. Both fields are optional: a
/// provider that is not Ollama, an unknown model, or an unfamiliar payload shape all yield `None`
/// rather than a guess.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContextLimits {
    /// The model architecture's own maximum, in tokens. A hard ceiling.
    pub architecture_max: Option<u32>,
    /// `num_ctx` pinned in the model's Modelfile, when it pins one.
    pub modelfile_num_ctx: Option<u32>,
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

/// Asks Ollama about `model`. Returns an empty result rather than an error when the provider simply
/// has nothing to say — only a transport failure is worth surfacing, since "we could not find out"
/// is a normal answer here and must not read as "your provider is down".
pub async fn fetch_model_context_limits(
    url: &str,
    model: &str,
) -> Result<ModelContextLimits, AppError> {
    #[derive(Serialize)]
    struct ShowRequest<'a> {
        model: &'a str,
    }

    let client = Client::builder()
        // A metadata lookup behind a Settings button: a long hang here is worse than "unknown".
        .timeout(Duration::from_secs(10))
        .build()?;

    let response = client
        .post(format!("{}/api/show", ollama_origin(url)))
        .json(&ShowRequest { model })
        .send()
        .await?;

    // A non-Ollama provider answers 404 here, which is information, not a failure.
    if !response.status().is_success() {
        return Ok(ModelContextLimits::default());
    }

    let body: serde_json::Value = response.json().await?;

    Ok(ModelContextLimits {
        architecture_max: body.get("model_info").and_then(architecture_context_length),
        modelfile_num_ctx: body
            .get("parameters")
            .and_then(|p| p.as_str())
            .and_then(modelfile_num_ctx),
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
}
