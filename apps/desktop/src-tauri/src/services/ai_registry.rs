use super::ai_anthropic::AnthropicProvider;
use super::ai_openai_compatible::OpenAiCompatibleProvider;
use super::ai_provider::AiProvider;

/// Dispatches on protocol (`AiProtocol` in `packages/ai`), not on the user-facing preset — several
/// presets (ollama/lmstudio/openai/mlx) share `"openai-compatible"` and therefore this same
/// provider instance. Adding a new protocol means adding one match arm here plus a new file
/// implementing `AiProvider`; existing arms/files never need to change.
pub fn provider_for(protocol: &str) -> Box<dyn AiProvider> {
    match protocol {
        "anthropic-messages" => Box::new(AnthropicProvider),
        _ => Box::new(OpenAiCompatibleProvider),
    }
}
