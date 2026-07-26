import type { AiContext } from '../config'
import type { StreamingFeature } from '../runtime'
import { truncateDiff } from './commitMessage'
import { languageName } from './language'

/** The instruction (system prompt) for explaining a whole branch. Streaming markdown, and a close
 * sibling of {@link prDescriptionFeature} — same `range`-scope input, opposite audience. A PR
 * description is written *for reviewers*, in the author's voice, and gets edited before it ships;
 * this is written *for the reader in front of the graph*, who is asking "what is this branch even
 * about?" — often about someone else's branch, before deciding to review, merge or check it out. */
export const BRANCH_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining what a Git branch changes, to a developer who is looking at it in a commit graph and does not know it yet.

You are given the branch's commit subjects and the full diff against its base branch. Explain the branch as a body of work: what it sets out to do, and what it actually changes in the codebase.

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence answering "what is this branch for?".
- Then a "## What changed" section: 3 to 6 bullets, each one coherent area of change (a module, a layer, a concern), naming the files or directories it touches with backticks. Group related commits into one bullet — do not restate the commit list, the reader can already see it.
- Then a "## Worth knowing" section: 1 to 3 bullets for what a reader should be aware of — a breaking change, a migration, a dependency added, a behavior change that isn't obvious from the file names. Write "- Nothing out of the ordinary." when the branch holds no such surprise; never pad this section.
- Base every statement ONLY on the commits and diff you are given. Do not invent tickets, tests, or intentions that are not evidenced. If the diff was truncated, say what you could not see rather than guessing at it.
- Describe, do not review: no praise, no suggestions, no "consider refactoring".
- Keep the whole answer under 300 words.
- Write the entire explanation in the language requested by the user prompt.`

/** Character budget for the range diff. Matches the PR-description feature — the two consume the
 * same `range` context, and a branch that overflows one overflows the other. */
const MAX_BRANCH_DIFF_CHARS = 8000

export interface BranchExplanationInput {
  /** Range-scope git context: `merge-base(base, branch)..branch` diff, files, and range commits. */
  context: AiContext
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the explanation should be written in. Populated from
   * app Settings so the prose matches the UI language. */
  language?: string
}

/** Builds the user-turn prompt: branch/base header, the branch's commit subjects, the changed-file
 * list, then the (possibly truncated) range diff. */
export function buildBranchExplanationPrompt(input: BranchExplanationInput): string {
  const { context, language } = input

  let prompt = `Repository: ${context.repoName}
Branch: ${context.branch}${context.baseRef ? ` (compared against ${context.baseRef})` : ''}
Write the entire explanation in ${languageName(language)}.
`

  const commits = context.rangeCommits ?? []
  prompt +=
    commits.length > 0
      ? `\nCommits on this branch (newest first):\n${commits.map((c) => `- ${c}`).join('\n')}\n`
      : `\n(No commits of its own — the branch is level with its base.)\n`

  if (context.files.length > 0) {
    prompt += `\nChanged files:\n${context.files.map((f) => `- ${f.path} (${f.status})`).join('\n')}\n`
  }

  prompt += `\n--- DIFF (base..branch) ---\n${truncateDiff(
    context.diff,
    MAX_BRANCH_DIFF_CHARS
  )}\n--- END DIFF ---

Explain what this branch does.`

  return prompt
}

/** Streaming feature: turn a branch's range diff + commits into a short markdown explanation of the
 * work it contains, token by token. */
export const branchExplanationFeature: StreamingFeature<BranchExplanationInput> = {
  id: 'branch-explanation',
  kind: 'streaming',
  instruction: BRANCH_EXPLANATION_INSTRUCTION,
  // Same reasoning as the file-level explanation: describing existing work wants reproducibility,
  // not the prose latitude a PR description (0.4) is given.
  temperature: 0.2,
  buildPrompt: buildBranchExplanationPrompt,
}
