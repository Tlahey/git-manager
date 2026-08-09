import { useEffect, useState } from 'react'
import { Bug, Play } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { DialogTitle, NativeSelect, Switch, Tooltip } from '@git-manager/ui'
import { SidePanelOverlay } from '@git-manager/components'
import {
  DEBUG_ACTIONS,
  debugActionGroups,
  deliverDebugCard,
  supportsNativeSurface,
} from '../../lib/debug/debugActions'
import { useDevFlagsStore } from '../../stores/devFlags.store'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useNotificationStore, type SimulatedChange } from '../../stores/notification.store'

/**
 * One place to make the app do something on purpose.
 *
 * Development only — `Footer` renders it behind `import.meta.env.DEV`, so the whole subtree (and
 * the fixtures it imports) is dead-code-eliminated from a production build. That is what allows
 * the copy in here to be plain English rather than going through `t()`: no user ever reads it. The
 * one exception is the PR simulator's own labels, which name git concepts the app already
 * translates elsewhere and which are reused as-is.
 *
 * It replaces the test buttons that used to live inside the notification bell and the Settings
 * panel. Having them there meant each new surface either got its own hand-rolled trigger next to
 * whatever component was nearest, or — as happened with the notch, the queue and the transfer
 * cards — no trigger at all.
 *
 * A side panel rather than a popover, for the reason `SidePanelOverlay` documents: this is a list
 * you scroll, not a question you answer. The first version was a popover whose scroll area was
 * capped with `max-h-[60vh]`, and a percentage-height viewport inside a max-height box resolves to
 * `auto` — so the pane grew past the popover, got clipped, and could not be scrolled at all.
 */
export function DebugMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip content="Debug menu (dev only)">
        <button
          onClick={() => setOpen(true)}
          aria-label="Debug menu"
          data-testid="footer-debug-button"
          className="flex cursor-pointer items-center justify-center rounded border border-transparent p-1 text-amber-500/80 shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-amber-400 active:scale-95"
        >
          <Bug className="h-3.5 w-3.5" />
        </button>
      </Tooltip>

      {open && (
        <SidePanelOverlay
          open={open}
          onClose={() => setOpen(false)}
          testIdPrefix="debug"
          // Narrower than the app's content panels: this is a column of buttons, not a diff.
          widthRatios={{ initial: 0.3, min: 0.22, max: 0.6 }}
        >
          <DebugPanel />
        </SidePanelOverlay>
      )}
    </>
  )
}

function DebugPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="debug-menu">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bug className="h-4 w-4 text-amber-500/80" />
          Debug
        </DialogTitle>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary">
          DEV MODE
        </span>
      </header>

      {/* `min-h-0 flex-1`, never a max-height: that is the whole fix. */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        <DevFlags />

        <QueueReadout />

        {debugActionGroups(DEBUG_ACTIONS).map(({ group, actions }) => (
          <Section key={group} title={group}>
            {actions.map((action) => (
              <DebugActionRow key={action.id} actionId={action.id} />
            ))}
          </Section>
        ))}

        <PrSimulator />
      </div>
    </div>
  )
}

/**
 * What the notch is showing, and what is waiting behind it.
 *
 * Here because the queue is the first thing that makes a debug button *look* broken: there is one
 * notch, a card holds it for its whole lifetime, and everything sent meanwhile waits its turn
 * silently. Pressing four buttons in a row shows one card and appears to lose three. This says so.
 */
function QueueReadout() {
  const queue = useNotchQueueStore((s) => s.queue)
  const clear = useNotchQueueStore((s) => s.clear)
  const waiting = queue.pending.length

  return (
    <div
      data-testid="debug-queue-readout"
      className="flex items-center justify-between gap-2 rounded border border-border/40 bg-accent/20 px-2.5 py-2"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] font-medium text-foreground">
          {queue.current ? `Showing: ${queue.current.model.eyebrow}` : 'The notch is idle'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {waiting > 0 ? `${waiting} waiting — one notch, one card at a time` : 'Nothing waiting'}
        </span>
      </span>
      {(queue.current || waiting > 0) && (
        <button
          onClick={() => clear()}
          data-testid="debug-queue-clear"
          className="shrink-0 cursor-pointer rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </section>
  )
}

/**
 * One entry: what it is, and where to send it.
 *
 * A card action gets two buttons, because "does this card work" and "does this card work *as a
 * macOS banner*" are two different questions and the app answers them with two different code
 * paths. The banner button is absent when the card has no banner form at all — a live progress
 * card cannot be one, since a banner is written once and never updated.
 *
 * An effect action (three at once, clear the queue, drive a transfer) has no single card to aim,
 * so it keeps one button.
 */
function DebugActionRow({ actionId }: { actionId: string }) {
  const { t } = useTranslation('common')
  const action = DEBUG_ACTIONS.find((a) => a.id === actionId)
  if (!action) return null

  const nativeAvailable = supportsNativeSurface(action)

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border/40 px-2.5 py-2">
      <span className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-foreground">{action.label}</span>
        <span className="text-[10px] leading-snug text-muted-foreground">{action.hint}</span>
      </span>

      <div className="flex items-center gap-1.5">
        {action.kind === 'card' ? (
          <>
            <SurfaceButton
              testId={`debug-action-${action.id}`}
              onClick={() => void deliverDebugCard(action.build(t), 'notch')}
            >
              Notch
            </SurfaceButton>
            {nativeAvailable && (
              <SurfaceButton
                testId={`debug-action-${action.id}-native`}
                onClick={() => void deliverDebugCard(action.build(t), 'native')}
              >
                macOS
              </SurfaceButton>
            )}
            {!nativeAvailable && (
              <span className="text-[9px] text-muted-foreground/70 italic">
                no banner form — a banner is written once
              </span>
            )}
          </>
        ) : (
          <SurfaceButton testId={`debug-action-${action.id}`} onClick={() => void action.run(t)}>
            Run
          </SurfaceButton>
        )}
      </div>
    </div>
  )
}

function SurfaceButton({
  testId,
  onClick,
  children,
}: {
  testId: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="cursor-pointer rounded border border-border px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-accent"
    >
      {children}
    </button>
  )
}

/**
 * Switches that change how the app behaves for the rest of the session.
 *
 * Unlike the actions below them, these are not one-shot: they are the reason the flags live in a
 * store rather than in `import.meta.env`, which can only be decided once at build time.
 */
function DevFlags() {
  const mockGitHub = useDevFlagsStore((s) => s.mockGitHub)
  const setMockGitHub = useDevFlagsStore((s) => s.setMockGitHub)

  return (
    <Section title="Flags">
      <label
        className="flex cursor-pointer items-center justify-between gap-3 rounded border border-border/40 px-2.5 py-2"
        data-testid="debug-flag-mock-github"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-foreground">Mock GitHub data</span>
          <span className="text-[10px] leading-snug text-muted-foreground">
            Fill the Launchpad with the built-in fixtures instead of a real account. Off, a
            token-less app shows an empty list — which is what a user gets.
          </span>
        </span>
        <Switch
          checked={mockGitHub}
          onChange={(e) => setMockGitHub(e.target.checked)}
          aria-label="Mock GitHub data"
        />
      </label>
    </Section>
  )
}

/**
 * Mutates a mock pull request and lets the watcher notice, rather than raising a notification
 * directly.
 *
 * The only test affordance here that is not a one-click action, because the interesting part is
 * the pair — *which* PR and *what happened to it*. It is also the only one that exercises the
 * detection half of the pipeline (`notificationRegistry`'s `detect` functions diffing one poll
 * against the next) instead of starting from an already-built notification.
 */
function PrSimulator() {
  const { t } = useTranslation('common')
  const mockGitHub = useDevFlagsStore((s) => s.mockGitHub)
  const mockPRs = useNotificationStore((s) => s.mockPRs)
  const simulateChange = useNotificationStore((s) => s.simulateChange)

  const [prId, setPrId] = useState('')
  const [action, setAction] = useState<SimulatedChange>('merge')

  useEffect(() => {
    if (mockPRs.length > 0 && !prId) setPrId(mockPRs[0].id)
  }, [mockPRs, prId])

  // Hidden unless the fixtures are actually what the app is reading. `simulateChange` mutates
  // `mockPRs`, and `useGitHubData` only hands those to the watcher when the flag above is on and no
  // GitHub account is connected — so with the flag off this was a button that visibly did nothing.
  if (!mockGitHub || mockPRs.length === 0) return null

  return (
    <Section title={t('notifications.simulator')}>
      <div className="flex items-center gap-1.5">
        <NativeSelect
          value={prId}
          onChange={(e) => setPrId(e.target.value)}
          aria-label="Pull request"
          data-testid="debug-sim-pr"
          className="h-7 flex-1 rounded border border-border bg-background px-1.5 text-[10px] text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
        >
          {mockPRs.map((pr) => (
            <option key={pr.id} value={pr.id}>
              PR #{pr.number} ({pr.repo})
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={action}
          onChange={(e) => setAction(e.target.value as SimulatedChange)}
          aria-label="Simulated change"
          data-testid="debug-sim-action"
          className="h-7 rounded border border-border bg-background px-1.5 text-[10px] text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
        >
          <option value="merge">{t('notifications.sim.prMerged')}</option>
          <option value="close">{t('notifications.sim.prClosed')}</option>
          <option value="request_review">{t('notifications.sim.reviewRequested')}</option>
          <option value="approve">{t('notifications.sim.reviewApproved')}</option>
          <option value="new_pr">{t('notifications.sim.newPR')}</option>
          <option value="ci_success">{t('notifications.sim.ciSuccess')}</option>
          <option value="ci_failed">{t('notifications.sim.ciFailed')}</option>
          <option value="queue">{t('notifications.sim.prQueued')}</option>
        </NativeSelect>
      </div>
      <button
        onClick={() => simulateChange(prId, action)}
        data-testid="debug-sim-run"
        className="flex h-7 cursor-pointer items-center justify-center gap-1 rounded bg-primary text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/95"
      >
        <Play className="h-2.5 w-2.5 fill-current" />
        <span>{t('notifications.runSim')}</span>
      </button>
    </Section>
  )
}
