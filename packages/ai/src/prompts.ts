/** The default instruction (system prompt) sent to the LLM when the user hasn't customized one.
 *
 * This is business/instruction content, so it lives here in `@git-manager/ai` — the single home
 * for the app's AI logic — rather than being hardcoded in the Rust provider (the calls/tools
 * layer). The backend now relays whatever instruction it receives and has no default of its own. */
export const DEFAULT_SYSTEM_PROMPT = `You are a Git commit message generator. Your task is to write a concise, meaningful commit message following the Conventional Commits specification.

Rules:
- First line: <type>(<scope>): <description> (max 72 chars)
- Use imperative mood: "add", "fix", "update"
- Scope is optional but recommended
- Add a body only if the change needs explanation
- Output ONLY the commit message, nothing else

Types: feat, fix, chore, docs, style, refactor, test, perf, build, ci`

/** Resolves the effective system prompt: the user's customization wins when it's non-blank,
 * otherwise the shipped default. A blank string is the "reset to default" state from the Settings
 * UI, so it falls through to {@link DEFAULT_SYSTEM_PROMPT}. */
export function resolveSystemPrompt(custom?: string): string {
  const trimmed = custom?.trim()
  return trimmed ? custom! : DEFAULT_SYSTEM_PROMPT
}
