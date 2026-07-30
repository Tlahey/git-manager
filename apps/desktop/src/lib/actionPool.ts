import type { ActivityLogEntry } from '../stores/activityLog.store'
import { groupActivityLog } from './groupActivityLog'
import {
  describeGitCommand,
  isGitCommandOperation,
  type GitCommandFamily,
} from './gitCommandCatalog'

/**
 * The last fifty things the user *did*, each as the batch of git commands it ran.
 *
 * Built on the activity log rather than beside it: that buffer already captures every IPC round-trip
 * and already groups the calls of one user action under a shared correlation id (see
 * `activityCorrelation.ts` / `groupActivityLog.ts`). What this adds is the two steps that turn a
 * developer's IPC trace into something a user can learn from:
 *
 * 1. **Drop everything that didn't change the repository.** The app reads constantly — status, log,
 *    diffs — and those calls outnumber the writes by orders of magnitude. The catalog's membership is
 *    the filter (see `gitCommandCatalog.ts`).
 * 2. **Order each action's commands the way they ran.** The log is newest-first, which is right for a
 *    stream you scan and wrong for a sequence you are trying to understand: "check out `main`, then
 *    merge `feat/x`" only teaches anything in that order.
 */

/** How many actions the pool holds. Fifty is what the window shows and what the user asked for; it is
 * also roughly a working session, which is the span over which "what did I just do" is a real
 * question. */
export const ACTION_POOL_SIZE = 50

/**
 * How many log lines to read off disk to find those fifty actions.
 *
 * Deliberately generous, because the ratio is not 1:1 and not stable: one commit is a handful of
 * writes surrounded by hundreds of polled reads. Too low a budget silently shortens the pool — the
 * failure this number exists to avoid — while too high costs one larger file read on a window the
 * user opened deliberately.
 */
export const ACTIVITY_READ_BUDGET = 4000

/**
 * Titles for the correlated actions the app declares through `runActivity`.
 *
 * A label like `git.commit` covers several operations (stage, then commit), so the block's title comes
 * from the action rather than from whichever command happened to be last. Keys, not strings — this is
 * a module-level map and cannot call `t()`.
 */
const ACTION_LABEL_KEYS: Record<string, string> = {
  // The two multi-step operations, whose block spans several user actions minutes apart — a rebase
  // through its conflict pauses, a bisect through every mark. See `activityCorrelation.ts`.
  'git.rebase': 'gitCommand.action.rebase',
  'git.bisect': 'gitCommand.action.bisect',
  'git.commit': 'gitCommand.action.commit',
  'git.autosquash': 'gitCommand.action.autosquash',
  'git.reset': 'gitCommand.action.reset',
  'git.checkout': 'gitCommand.action.checkout',
  'git.rebaseInteractive': 'gitCommand.action.rebaseInteractive',
  'git.fetch': 'gitCommand.action.fetch',
  'git.pull': 'gitCommand.action.pull',
  'git.push': 'gitCommand.action.push',
}

/** One catalogued operation inside an action, with the git command line(s) it ran. */
export interface PooledCommand {
  /** Id of the activity entry behind it — the key the UI lists on. */
  entryId: string
  /** The IPC command name, kept because it is what the log actually recorded: the git rendering is a
   * translation, and a user chasing a bug needs the untranslated name. */
  command: string
  titleKey: string
  family: GitCommandFamily
  /** The git command line(s), in execution order. */
  lines: string[]
  status: 'ok' | 'error'
  error?: string
  timestamp: number
  durationMs: number
}

/** One user action — or one whole multi-step operation: a batch of git commands with a shared
 * identity. */
export interface PooledAction {
  /**
   * Identity of the block, and the key its remembered explanation is stored under.
   *
   * The id of its **first** operation, not the correlation id it groups on. Two reasons, and the first
   * is a bug: an operation's session id can legitimately appear in two blocks, because
   * `groupActivityLog` only merges *consecutive* entries and an unrelated action between two rebase
   * steps splits them — so the correlation id is not unique in the pool. The second is stability: a
   * block's first operation never changes as later steps are appended, so a remembered explanation
   * stays attached to it while the rebase is still running.
   */
  id: string
  /** The `runActivity` label (`git.pull`) when the operations were issued inside one, else absent —
   * an uncorrelated operation is its own action. */
  label?: string
  /** i18n key for the action's title. */
  titleKey: string
  family: GitCommandFamily
  /** Repository the action targeted, when its operations carried one. */
  repoPath?: string
  /** When the action started (its earliest operation). */
  startTimestamp: number
  /** Summed execution time of every operation in it. */
  totalDurationMs: number
  /** `error` as soon as any one operation failed — a half-applied action is not a success. */
  status: 'ok' | 'error'
  /** Its operations, oldest first. */
  commands: PooledCommand[]
}

/**
 * Turns a slice of the activity log into the action pool, newest action first.
 *
 * Filtering happens *before* grouping, on purpose. `groupActivityLog` only merges *consecutive*
 * entries sharing a correlation id, and a user action's writes are interleaved with the reads it
 * triggers (a commit refreshes the status and the log) — so grouping first and filtering after would
 * split one commit into two or three separate actions.
 */
export function buildActionPool(
  entries: ActivityLogEntry[],
  limit: number = ACTION_POOL_SIZE
): PooledAction[] {
  const actionable = entries.filter((entry) => isGitCommandOperation(entry.command))

  return groupActivityLog(actionable, 'application', null)
    .slice(0, limit)
    .map(toPooledAction)
    .filter((action): action is PooledAction => action !== null)
}

/** One activity block as an action, or `null` if none of its entries could be described (which
 * `buildActionPool`'s filter already rules out, but the types don't know that). */
function toPooledAction(block: {
  id: string
  label?: string
  entries: ActivityLogEntry[]
  startTimestamp: number
  totalDurationMs: number
}): PooledAction | null {
  // Blocks arrive newest-first, like the log they come from; an action reads in execution order.
  const commands = [...block.entries].reverse().flatMap(toPooledCommand)
  // The action's own identity comes from its last operation: `git.commit` stages files and then
  // commits, and it is the commit that says what happened.
  const first = commands[0]
  const last = commands[commands.length - 1]
  if (!first || !last) return null

  return {
    // See `PooledAction.id`: the first operation's id, not `block.id`.
    id: first.entryId,
    label: block.label,
    titleKey: (block.label && ACTION_LABEL_KEYS[block.label]) ?? last.titleKey,
    family: last.family,
    repoPath: block.entries.find((entry) => entry.repoPath !== undefined)?.repoPath,
    startTimestamp: block.startTimestamp,
    totalDurationMs: block.totalDurationMs,
    status: commands.some((command) => command.status === 'error') ? 'error' : 'ok',
    commands,
  }
}

/** One entry as a pooled command, or nothing when it isn't catalogued. Returns an array so callers
 * can `flatMap` it. */
function toPooledCommand(entry: ActivityLogEntry): PooledCommand[] {
  const described = describeGitCommand(entry.command, entry.args)
  if (!described) return []
  return [
    {
      entryId: entry.id,
      command: entry.command,
      titleKey: described.titleKey,
      family: described.family,
      lines: described.lines,
      status: entry.status,
      error: entry.error,
      timestamp: entry.timestamp,
      durationMs: entry.durationMs,
    },
  ]
}
