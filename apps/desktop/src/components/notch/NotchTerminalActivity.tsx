import { useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { TerminalFinished } from '../../stores/terminal.store'
import { useTerminalStore } from '../../stores/terminal.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { terminalFinishedNotchModel } from '../../lib/notifications/terminalNotch'

/**
 * Puts a finished terminal command on the notch — the one way to learn an agent is done without
 * keeping the terminal panel open and watched.
 *
 * Renders nothing — same shape as `NotchRemoteOperations`/`NotchRunningHooks`: one card component
 * per entry, because the entry count changes and hooks can't be called in a loop. Unlike those two,
 * there is no live card here, only the one-shot outcome: a session enters `finished` already
 * *having* finished, so the card component mounting is itself the transition, and `useEffect` with
 * no reactive dependencies is what fires it exactly once per appearance.
 *
 * Mounted once by `App`, next to the other notch producers.
 */
export function NotchTerminalActivity() {
  const finished = useTerminalStore((s) => s.finished)
  const sessions = useTerminalStore((s) => s.sessions)
  const notifications = useSettingsStore((s) => s.settings.notifications)
  const enabled =
    (notifications?.enabled ?? true) && (notifications?.notifyOnTerminalFinished ?? true)

  return (
    <>
      {Object.entries(finished).map(([sessionId, entry]) => (
        <TerminalFinishedCard
          key={sessionId}
          sessionId={sessionId}
          finished={entry}
          cwd={sessions.find((s) => s.id === sessionId)?.cwd ?? ''}
          enabled={enabled}
        />
      ))}
    </>
  )
}

function TerminalFinishedCard({
  sessionId,
  finished,
  cwd,
  enabled,
}: {
  sessionId: string
  finished: TerminalFinished
  cwd: string
  enabled: boolean
}) {
  const { t } = useTranslation('git')

  useEffect(() => {
    if (!enabled) return
    useNotchQueueStore.getState().enqueue({
      model: terminalFinishedNotchModel({ sessionId, command: finished.command, cwd, t }),
      importance: 'key',
    })
    // Deliberately fires once per mount, not on every prop change: this card exists only while the
    // session is unseen in `finished` (see terminal.store.ts), so mounting *is* the busy→idle
    // transition. Reacting to `enabled` here too would re-fire the card if the user flips the
    // setting back on while one is still showing, which isn't a new command finishing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return null
}
