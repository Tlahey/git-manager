import type { StreamingFeature } from '../runtime'
import { languageName } from './language'
import { DEFAULT_CONTEXT_TOKENS, estimateTokens, variableCharBudget } from '../promptSize'

/**
 * The instruction for explaining **one action the user just performed** — the batch of `git` commands
 * the app ran behind a button — to the person who pressed that button.
 *
 * This is the only feature whose subject is the *app's own behaviour* rather than the repository's
 * contents, and that changes what it has to be told. The other explanations are handed a diff and
 * asked what it means; this one is handed a list of commands that have **already run**, and its whole
 * value is that every statement about them is checkable against `git help`. So the rules are built
 * around two failure modes that would each destroy that value:
 *
 * 1. **Inventing commands.** A model asked to explain `git commit` will happily narrate the
 *    `git add` it assumes preceded it, or the `git push` it assumes followed. In a teaching feature
 *    that is not a small error: the user reads it as a record of what the app did to their
 *    repository, and acts on it. The list given is exhaustive, and the instruction says so twice.
 * 2. **Explaining the app instead of git.** The prompt carries each operation's internal name
 *    (`create_fixup_commit`) because it is what the log recorded and a user chasing a bug needs it —
 *    but those names are not git concepts, and a model that latches onto them teaches the app's
 *    implementation rather than the tool.
 *
 * There is no diff here and no repository state: the model is told what ran, not what it produced.
 * Which is why the instruction forbids describing outcomes it cannot see — "this removed the bug" is
 * a sentence about a diff nobody sent.
 */
export const ACTION_EXPLANATION_INSTRUCTION = `You are a patient git teacher. A developer just performed one action in a graphical git client, and you are explaining what that action ran underneath, so they understand the tool rather than only the button.

You are given the git command(s) the action executed, in the order they ran, with whether each succeeded.

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence saying what this action did to the repository, in plain language.
- Then one bullet per command, in the order given. Put the command in backticks, then explain what it does and what part of git it touches (working tree, index/staging area, local branch, remote, stash, reflog). Name the concept, do not just reword the flags.
- End with one short line under a "**Good to know**" heading: the single most useful thing about this action — a related command worth knowing, a common mistake, or how to undo it. One or two sentences, never a list.
- When a command failed, explain what that error means and what usually causes it, instead of describing what the command would have done.
- The command list you were given is COMPLETE. Never mention, imply, or explain a command that is not in it — no assumed \`git add\` before a commit, no assumed \`git push\` after one.
- Explain **git**, not this application. Operation names like \`create_fixup_commit\` are the app's internal labels; they are context for you, never something to teach or to quote as if they were git.
- You were given the commands only, never their output and never a diff. Never state what a command produced, what changed in the code, or what the repository now contains beyond what the command itself guarantees.
- Some arguments appear as placeholders like \`<file>\` or \`<commit>\` because the app did not record them. Refer to them generically ("the file", "that commit") and never invent a name.
- If a command rewrites history or discards work (\`reset --hard\`, \`rebase\`, \`push --force\`, \`restore\`, \`stash drop\`), say so plainly in its bullet. Do not soften it, and do not add a warning to commands that do not deserve one.
- Keep the whole answer under 220 words. A short, correct explanation is the goal.
- Write the entire explanation in the language requested by the user prompt.`

/** One operation inside the action: the git command line(s) it ran, and how it went. */
export interface ActionExplanationCommand {
  /**
   * The git command line(s) this one operation stands for, in execution order.
   *
   * A list because one operation legitimately runs more than one command — merging a branch the app
   * is not on checks it out first. The app renders these (see its `gitCommandCatalog.ts`); this
   * package neither knows nor guesses git syntax.
   */
  lines: string[]
  /** The app's internal operation name (`create_commit`). Passed as context, never as something to
   * teach — see the instruction. */
  operation: string
  status: 'ok' | 'error'
  /** The failure message, when it failed. */
  error?: string
}

export interface ActionExplanationInput {
  /** The action's own name when the app declared one (`git.pull`), else absent — a lone operation is
   * its own action. Given so the model can tell "one commit" from "part of a pull". */
  action?: string
  /** Repository the action targeted, for context. Absent for an action that targets no repo. */
  repoName?: string
  /** The operations, oldest first. */
  commands: ActionExplanationCommand[]
  /** BCP-47-ish tag (`'fr'` / `'en'`) the explanation should be written in, from app Settings. */
  language?: string
  /** The model's context window, from the connection settings. Sizes the command list — see
   * {@link buildActionExplanationPrompt}. */
  contextTokens?: number
}

/**
 * Cap on the command lines printed, whatever the window allows.
 *
 * The budget alone is not enough here, and this is the one sizing question the feature actually has:
 * "stage everything" is a single `git add -A`, but staging files one by one in the UI is one
 * operation *per file*, so an action can carry two hundred near-identical `git add` lines. A window
 * large enough to hold them all would spend the answer's 220 words listing them, which teaches
 * nothing — twelve examples plus a count teaches the same lesson.
 */
export const MAX_LISTED_COMMANDS = 12

/** The header, whose size is known before the command list is budgeted. Shared so the prompt and the
 * budget can never disagree about what the envelope costs. */
function buildPromptHeader(input: ActionExplanationInput): string {
  const { action, repoName, commands, language } = input
  return [
    repoName ? `Repository: ${repoName}` : null,
    action ? `Action: ${action}` : null,
    `Commands executed: ${commands.length}`,
    `Write the entire explanation in ${languageName(language)}.`,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/** One operation as a prompt line: its command(s), then its outcome when it failed. */
function renderCommand(command: ActionExplanationCommand, index: number): string {
  const head = command.lines.map((line, i) => (i === 0 ? `${index + 1}. ${line}` : `   ${line}`))
  const trailer =
    command.status === 'error'
      ? `   → FAILED${command.error ? `: ${command.error}` : ''}`
      : `   (app operation: ${command.operation})`
  return [...head, trailer].join('\n')
}

/**
 * Builds the user-turn prompt: what the action was, then the commands it ran, numbered.
 *
 * The list is capped twice — by {@link MAX_LISTED_COMMANDS} and by what the window affords — and the
 * count it did not print is always named. Saying so matters more here than in a diff-carrying feature:
 * an unexplained cut leaves the model believing it has the complete list the instruction promised it,
 * which is precisely the belief that produces a confident, wrong account of a fifty-file staging.
 */
export function buildActionExplanationPrompt(input: ActionExplanationInput): string {
  const header = buildPromptHeader(input)
  const budget = variableCharBudget(
    input.contextTokens ?? DEFAULT_CONTEXT_TOKENS,
    estimateTokens(ACTION_EXPLANATION_INSTRUCTION) + estimateTokens(header)
  )

  const rendered: string[] = []
  let used = 0
  for (const [index, command] of input.commands.slice(0, MAX_LISTED_COMMANDS).entries()) {
    const line = renderCommand(command, index)
    // Always take the first, however tight the window: a prompt with no command in it asks the model
    // to explain nothing, and would be answered anyway.
    if (rendered.length > 0 && used + line.length > budget) break
    rendered.push(line)
    used += line.length
  }

  const omitted = input.commands.length - rendered.length
  const omittedNote =
    omitted > 0
      ? `\n…and ${omitted} more command${omitted > 1 ? 's' : ''} of the same action, not shown.` +
        ` Explain the ${rendered.length} above and say the action repeated the same kind of` +
        ` operation ${input.commands.length} times in total. Do not guess what the others were.`
      : ''

  return `${header}

--- COMMANDS THAT RAN (in order) ---
${rendered.join('\n')}${omittedNote}
--- END COMMANDS ---

Explain what this action did and what these commands are for.`
}

/** Streaming feature: turn one performed action into a short markdown lesson about the git commands
 * behind it, token by token. */
export const actionExplanationFeature: StreamingFeature<ActionExplanationInput> = {
  id: 'action-explanation',
  kind: 'streaming',
  instruction: ACTION_EXPLANATION_INSTRUCTION,
  // As low as the change explanation, and for a stronger reason: the answer is a statement about what
  // documented commands do. There is no room for latitude in "what does `git reset --hard` mean", and
  // two users asking about the same action should read the same thing.
  temperature: 0.2,
  buildPrompt: buildActionExplanationPrompt,
}
