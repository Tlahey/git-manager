/**
 * A finished terminal command, as a notch card.
 *
 * A pure builder, like the transfers' and the hooks'. The store only knows a session went from busy
 * to idle and what was running — not whether it succeeded, so unlike `remoteOutcomeNotchModel` this
 * has no error/success split to make. The point is simply "come look", which is why every card is
 * `tone: 'neutral'` rather than a verdict this data can't support.
 */

import type { NotchModel } from '@git-manager/notch'
import type { TFunction } from '@git-manager/i18n'
import { repoNameOf } from './remoteNotch'

export interface TerminalFinishedNotchInput {
  sessionId: string
  /** The command's name, when the backend could resolve one — see `TerminalFinished.command`. */
  command: string | null
  /** The session's working directory for its whole life — names which repo/worktree on the card. */
  cwd: string
  t: TFunction
}

export function terminalFinishedNotchModel({
  sessionId,
  command,
  cwd,
  t,
}: TerminalFinishedNotchInput): NotchModel {
  return {
    id: `terminal:finished:${sessionId}`,
    kind: 'status',
    tone: 'neutral',
    eyebrow: t('terminal.title'),
    context: repoNameOf(cwd),
    title: command ? t('terminal.finishedCommand', { command }) : t('terminal.finished'),
  }
}
