use crate::error::AppError;
use crate::models::AiProviderStatus;
use crate::services::ai_activity::{build_ai_activity, AiActivity};
use crate::services::ai_commit_scan::{build_ai_commit_scan, AiCommitScan};
use crate::services::ai_context::{build_ai_context, AiContext, AiContextScope};
use crate::services::ai_model_info::{fetch_model_context_limits, ModelContextLimits};
use crate::services::ai_provider::{GenerateConfig, StreamHandle};
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
    /// Cap on the model's answer, in tokens. Chosen by `@git-manager/ai` from the same reserve its
    /// prompt budgets subtract, so the answer cannot overflow the window the prompt was sized for.
    /// Optional on the wire only for tolerance of an older caller — absent means "do not send one".
    pub max_tokens: Option<u32>,
    /// The user's own extra request fields, from Settings. Merged under the app's — see
    /// `GenerateConfig::extra_body` for why the app's win.
    pub extra_body: Option<serde_json::Map<String, serde_json::Value>>,
}

impl From<AiGenerateConfig> for GenerateConfig {
    fn from(c: AiGenerateConfig) -> Self {
        GenerateConfig {
            url: c.url,
            model: c.model,
            api_key: c.api_key,
            temperature: c.temperature,
            timeout_seconds: c.timeout_seconds,
            max_tokens: c.max_tokens,
            extra_body: c.extra_body,
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
        max_tokens: None,
        extra_body: None,
    };
    provider
        .check_status(&generate_config)
        .await
        .map_err(Into::into)
}

/// Asks the provider what `model`'s context window really is, so the value declared in Settings can
/// be sanity-checked instead of trusted blindly. Ollama-only — see `ai_model_info`, which is also
/// where the difference between the model's *ceiling* and the window the server actually
/// *allocated* is explained. Returns empty fields rather than an error when the provider has nothing
/// to say, because "unknown" is a normal answer here and must not be shown as a connection failure.
#[tauri::command]
pub async fn get_model_context_limits(
    url: String,
    model: String,
    api_key: Option<String>,
) -> Result<ModelContextLimits, String> {
    fetch_model_context_limits(&url, &model, api_key.as_deref())
        .await
        .map_err(Into::into)
}

/// Snapshots repo changes for a feature's prompt (git2 logic lives in the service layer). `scope` is
/// `"staged"`, `"working"`, or `"range"`; `range` diffs `base_ref..head_ref` and requires
/// `base_ref`. `head_ref` is optional and defaults to `HEAD` — pass it to scope the range to a
/// branch that isn't checked out.
#[tauri::command]
pub async fn get_ai_context(
    path: String,
    scope: String,
    base_ref: Option<String>,
    head_ref: Option<String>,
) -> Result<AiContext, String> {
    build_ai_context(
        &path,
        AiContextScope::from_str(&scope),
        base_ref.as_deref(),
        head_ref.as_deref(),
    )
    .map_err(Into::into)
}

/// Gathers the activity context (commits authored on the main branch within
/// `[since_epoch, until_epoch]` + current uncommitted work) for the daily-summary feature.
///
/// The bounds are absolute epoch seconds delimiting one **local calendar day**, computed by the
/// frontend because only it knows the user's clock and time zone; `candidates` is the same ordered
/// main-branch list the merge-target indicator uses. The backend stays a pure git query.
#[tauri::command]
pub async fn get_ai_activity(
    path: String,
    since_epoch: i64,
    until_epoch: i64,
    candidates: Vec<String>,
) -> Result<AiActivity, String> {
    build_ai_activity(&path, since_epoch, until_epoch, &candidates).map_err(Into::into)
}

/// Lists the commits an AI *search* will read: the most recent non-merge commits, newest first, each
/// with its full oid and touched paths. `max_commits` bounds the scan — every returned commit costs
/// one model call, so the caller sets it and the service clamps it to a sane range. `since_hours` is
/// an optional extra bound; omitting it (the normal case) means "just the newest N".
#[tauri::command]
pub async fn get_ai_commit_scan(
    path: String,
    since_hours: Option<i64>,
    max_commits: Option<usize>,
) -> Result<AiCommitScan, String> {
    build_ai_commit_scan(&path, since_hours, max_commits).map_err(Into::into)
}

/// Generic streaming generation: relays a fully built system/user prompt to the selected provider
/// and streams tokens back via `ai:token`/`ai:done` events. Feature-agnostic — every streaming AI
/// feature (commit message, future report generation, …) goes through this one command.
///
/// `request_id` is minted by the frontend, tags every event this generation emits, and is what
/// `cancel_generation` targets. It exists because these events are window-wide broadcasts: before
/// it, a second generation started while the first was streaming received the first's tokens, and
/// cancelling either one stopped both.
///
/// Errors are reported by returning `Err` — the `invoke` promise is already this request's own
/// channel. See {@link AiProvider::generate}.
#[tauri::command]
pub async fn ai_generate_stream(
    config: AiGenerateConfig,
    system_prompt: String,
    user_prompt: String,
    request_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let cancel = state.generations.register(&request_id);
    let stream = StreamHandle::new(app, request_id.clone(), cancel);

    let provider = provider_for(&config.protocol);
    let generate_config: GenerateConfig = config.into();

    let result = provider
        .generate(&generate_config, &system_prompt, &user_prompt, &stream)
        .await;

    // On every exit path, including the error one: an entry left behind would keep this id's flag
    // alive, and a re-run reusing it would inherit a stale cancellation.
    state.generations.finish(&request_id);

    result.map_err(Into::into)
}

/// Generic non-streaming completion: relays a fully built system/user prompt and returns the full
/// response as a string. Used by features that need a complete, parseable answer (e.g. file→commit
/// grouping) rather than incremental tokens.
///
/// ## Why this takes a `request_id`, exactly like the streaming command
///
/// It did not, and that was the whole of "Cancel doesn't stop the model". A completion has no
/// events to stop emitting, so it looked like there was nothing to cancel — but the *request* is
/// what costs the user's time, and a run built out of completions is built out of many. The AI
/// features that map over files or commits issue one completion each and only poll for cancellation
/// **between** dispatches (`mapConcurrently`), because there was no way to reach into one already
/// sent: pressing stop left everything in flight running to the end, up to the concurrency limit,
/// at tens of seconds apiece. The user watched the model keep working after telling it not to.
///
/// So the flag is the same registry the streaming path uses, named by the same kind of id. Racing
/// the provider against it and dropping the loser is what actually ends the HTTP request: a
/// `reqwest` future cancels on drop, so nothing is left talking to the model.
///
/// [`CompletionCancelled`] is returned rather than an error string of its own, so a caller can tell
/// "the user stopped this" from "the model failed" without matching on prose.
#[tauri::command]
pub async fn ai_complete(
    config: AiGenerateConfig,
    system_prompt: String,
    user_prompt: String,
    schema: Option<serde_json::Value>,
    request_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let cancel = state.generations.register(&request_id);

    let provider = provider_for(&config.protocol);
    let generate_config: GenerateConfig = config.into();

    let completion = provider.complete(
        &generate_config,
        &system_prompt,
        &user_prompt,
        schema.as_ref(),
    );

    let result = tokio::select! {
        // Biased so a completion that finished in the same tick as the cancel is still delivered:
        // throwing away an answer already paid for helps nobody, and the caller discards it anyway
        // if it no longer wants it.
        biased;
        answer = completion => answer.map_err(Into::into),
        () = wait_for_cancel(&cancel) => Err(String::from(AppError::AiProvider(
            COMPLETION_CANCELLED.to_string(),
        ))),
    };

    // On every exit path, including the cancelled one: an entry left behind would keep this id's
    // flag alive, and a re-run reusing it would inherit a stale cancellation.
    state.generations.finish(&request_id);

    result
}

/// The marker a cancelled completion comes back with, so a caller can tell a user's stop from a
/// model failure without matching on prose. Mirrored in `packages/ai`.
pub const COMPLETION_CANCELLED: &str = "completion-cancelled";

/// Resolves once the flag is raised.
///
/// Polled rather than notified because the flag is an `AtomicBool` shared with the streaming path,
/// which polls it the same way between SSE chunks — adding a notifier for this one caller would
/// mean two mechanisms for one piece of state. The interval bounds how long a cancelled request
/// keeps its socket open, and 50 ms against calls measured in seconds is far below anything a user
/// can perceive.
async fn wait_for_cancel(flag: &std::sync::atomic::AtomicBool) {
    use std::sync::atomic::Ordering;
    while !flag.load(Ordering::SeqCst) {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}

/// Cancels one streaming generation, named by the `request_id` its caller minted.
///
/// An unknown id is a no-op rather than an error: hitting stop as the last token lands is a normal
/// race, and there is nothing for the user to do about it.
#[tauri::command]
pub async fn cancel_generation(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.generations.cancel(&request_id);
    Ok(())
}
