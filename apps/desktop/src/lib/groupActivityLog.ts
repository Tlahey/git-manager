import type { ActivityLogEntry } from '../stores/activityLog.store'

export type ActivityScope = 'application' | 'repository'

/**
 * A block of IPC operations that belong to the same user action, keyed by `correlationId`
 * (see `lib/activityCorrelation.ts`). Operations issued outside any `runActivity` become their own
 * singleton block. Blocks are what the Activity Logs view renders — and, later, what can be handed
 * to an LLM to explain "what did this action do".
 */
export interface ActivityBlock {
  /** Correlation id, or the lone entry's id for a singleton (uncorrelated) block. */
  id: string
  /** Label of the correlated action (e.g. `git.pull`); undefined for singleton blocks. */
  label?: string
  /** Operations in the block, kept in the store's newest-first order. */
  entries: ActivityLogEntry[]
  /** Timestamp of the block's earliest operation (when the action started). */
  startTimestamp: number
  /** Summed execution time of every operation in the block. */
  totalDurationMs: number
}

/**
 * Filters the activity buffer to the requested scope, then groups consecutive entries sharing a
 * `correlationId` into blocks. Entries are expected newest-first (as stored); block order and the
 * order within each block preserve that. Uncorrelated entries each become a singleton block.
 *
 * For the `repository` scope, only operations whose `repoPath` matches `activeRepo` are kept — so a
 * `null` active repo yields no repository-scoped blocks.
 */
export function groupActivityLog(
  entries: ActivityLogEntry[],
  scope: ActivityScope,
  activeRepo: string | null
): ActivityBlock[] {
  const scoped =
    scope === 'repository'
      ? entries.filter((e) => activeRepo !== null && e.repoPath === activeRepo)
      : entries

  const blocks: ActivityBlock[] = []
  let current: ActivityBlock | null = null

  for (const entry of scoped) {
    const canMerge = entry.correlationId !== undefined && current?.id === entry.correlationId
    if (canMerge && current) {
      current.entries.push(entry)
      current.startTimestamp = Math.min(current.startTimestamp, entry.timestamp)
      current.totalDurationMs += entry.durationMs
    } else {
      current = {
        id: entry.correlationId ?? entry.id,
        label: entry.correlationLabel,
        entries: [entry],
        startTimestamp: entry.timestamp,
        totalDurationMs: entry.durationMs,
      }
      blocks.push(current)
    }
  }

  return blocks
}
