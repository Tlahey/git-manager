/**
 * Fetch, pull and push, as notch cards.
 *
 * The transfers are the app's most ordinary long operation and, until now, its most opaque: a push
 * of a large branch over a slow link is minutes of a spinner that says nothing, and the *only*
 * feedback anywhere was the toolbar button being disabled.
 *
 * A pure builder, like the commit search's. Given what the store knows about one operation, it
 * returns what the notch should show — including `null`, which is the answer for the transfers not
 * worth a card at all.
 */

import type { NotchModel, NotchTone } from '@git-manager/notch'
import type { TFunction } from '@git-manager/i18n'
import type { RemoteOperation } from '../tauri'
import type { RemoteOperationEntry } from '../../stores/remoteProgress.store'
import { STATUS_OUTPUT_MAX_LINES } from '@git-manager/notch'

/** One card per repository *and* operation: a fetch and a push are two separate waits. */
export function remoteNotchId(repoPath: string, operation: RemoteOperation): string {
  return `remote:${operation}:${repoPath}`
}

/** The repository's own name, which is what identifies it on a card — not its path. */
export function repoNameOf(repoPath: string): string {
  return repoPath.split('/').filter(Boolean).pop() ?? repoPath
}

/** Human-readable bytes. Transfers are the one place the byte count is the honest measure of a
 *  wait: on a large blob the object counter can sit still for a long time. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export interface RemoteNotchInput {
  entry: RemoteOperationEntry
  t: TFunction
}

/**
 * The live card for a transfer in flight, or `null` once it has ended.
 *
 * Deliberately indeterminate until the first report arrives: a bar at 0 % while the client is
 * still negotiating with the server is a bar that looks stuck before any work has been done.
 */
export function remoteProgressNotchModel({ entry, t }: RemoteNotchInput): NotchModel | null {
  if (entry.outcome) return null

  const { progress } = entry
  const base = {
    id: remoteNotchId(entry.repoPath, entry.operation),
    eyebrow: t(`remote.notch.${entry.operation}.eyebrow`),
    context: repoNameOf(entry.repoPath),
  }

  if (!progress) {
    return {
      ...base,
      kind: 'progress',
      tone: 'running',
      title: t('remote.notch.connecting'),
    }
  }

  return {
    ...base,
    kind: 'progress',
    tone: 'running',
    title: t(`remote.notch.phase.${progress.phase}`),
    // `total` is 0 until the server announces a count; a ratio built from it would read as 0 %.
    ...(progress.total > 0 ? { ratio: Math.min(1, progress.completed / progress.total) } : {}),
    detail: t('remote.notch.detail', {
      done: progress.completed,
      total: progress.total,
      size: formatBytes(progress.bytes),
    }),
  }
}

/**
 * The card a finished transfer leaves behind, or `null` when it has nothing to say.
 *
 * A fetch that moved no ref is exactly that: nothing to say. Announcing every no-op fetch — and
 * this app fetches on a timer — would train the user to ignore the notch within a day, which is
 * the one failure a notification surface never recovers from.
 */
export function remoteOutcomeNotchModel({ entry, t }: RemoteNotchInput): NotchModel | null {
  const outcome = entry.outcome
  if (!outcome) return null

  const base = {
    id: `${remoteNotchId(entry.repoPath, entry.operation)}:done`,
    eyebrow: t(`remote.notch.${entry.operation}.eyebrow`),
    context: repoNameOf(entry.repoPath),
  }

  if (outcome.kind === 'error') {
    return {
      ...base,
      kind: 'status',
      tone: 'error' satisfies NotchTone,
      title: t(`remote.notch.${entry.operation}.failed`),
      // The tail of the message, because git's useful part (auth, non-fast-forward, host key) is
      // at the end of it.
      outputLines: errorLines(outcome.message ?? ''),
      actions: [{ id: 'activate', label: t('remote.notch.open'), variant: 'primary' }],
    }
  }

  const updated = outcome.updatedRefs?.length ?? 0
  if (entry.operation === 'fetch' && updated === 0) return null

  return {
    ...base,
    kind: 'status',
    tone: 'success',
    title:
      entry.operation === 'fetch'
        ? t('remote.notch.fetch.done', { count: updated })
        : t(`remote.notch.${entry.operation}.done`),
    actions: [{ id: 'activate', label: t('remote.notch.open'), variant: 'primary' }],
  }
}

/** The last few lines of an error, trimmed of blanks — what the card has room to show. */
export function errorLines(message: string): string[] {
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-STATUS_OUTPUT_MAX_LINES)
}
