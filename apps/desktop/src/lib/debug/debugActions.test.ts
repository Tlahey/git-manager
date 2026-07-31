import { describe, it, expect, vi, beforeEach } from 'vitest'
import { i18next, type TFunction } from '@git-manager/i18n'
import { emptyNotchQueue } from '@git-manager/notch'
import {
  DEBUG_ACTIONS,
  debugActionGroups,
  deliverDebugCard,
  supportsNativeSurface,
  type DebugAction,
  type DebugSurface,
} from './debugActions'
import { isEligibleForNativeBanner } from '../notifications/notchDelivery'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useNotificationStore } from '../../stores/notification.store'
import { useRemoteProgressStore } from '../../stores/remoteProgress.store'

const { sendNative } = vi.hoisted(() => ({ sendNative: vi.fn() }))
vi.mock('../../api/notification.api', () => ({
  apiSendNativeNotification: (...a: unknown[]) => sendNative(...a),
}))

const t = i18next.getFixedT('en', 'common') as unknown as TFunction

const INITIAL_NOTIF = useNotificationStore.getState()

function action(id: string): DebugAction {
  const found = DEBUG_ACTIONS.find((a) => a.id === id)
  if (!found) throw new Error(`no debug action "${id}"`)
  return found
}

/** Runs an action the way the menu does: a card is aimed at a surface, an effect just runs. */
function run(id: string, surface: DebugSurface = 'notch') {
  const entry = action(id)
  if (entry.kind === 'effect') return entry.run(t)
  return deliverDebugCard(entry.build(t), surface)
}

function queueIds(): string[] {
  const { queue } = useNotchQueueStore.getState()
  return [
    ...(queue.current ? [queue.current.model.id] : []),
    ...queue.pending.map((entry) => entry.model.id),
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotificationStore.setState({ ...INITIAL_NOTIF, notifications: [] })
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  useRemoteProgressStore.setState({ operations: {} })
})

describe('DEBUG_ACTIONS — catalogue', () => {
  it('has unique ids, so the menu cannot render two identical buttons', () => {
    const ids = DEBUG_ACTIONS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every action a label and a hint about what to watch for', () => {
    for (const entry of DEBUG_ACTIONS) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.hint.length).toBeGreaterThan(0)
    }
  })

  it('offers a banner form for the cards that have one, and not for the live ones', () => {
    // A banner is written once and never updated, so a progress card simply cannot be one — the
    // menu hides the button rather than offering something that would arrive frozen.
    expect(supportsNativeSurface(action('notify-merged'))).toBe(true)
    expect(supportsNativeSurface(action('notch-status-failure'))).toBe(true)
    expect(supportsNativeSurface(action('notch-progress-determinate'))).toBe(false)
    expect(supportsNativeSurface(action('notch-progress-indeterminate'))).toBe(false)
  })

  it('offers no surface choice for an action that is not a single card', () => {
    expect(supportsNativeSurface(action('queue-burst'))).toBe(false)
    expect(supportsNativeSurface(action('transfer-fetch-running'))).toBe(false)
  })

  it('declares a banner capability that matches what the card really is', () => {
    // The flag is declared rather than derived, because deriving it meant calling `build` — which
    // records a notification. This is what keeps the duplicate honest.
    for (const entry of DEBUG_ACTIONS) {
      if (entry.kind !== 'card') continue
      expect(entry.nativeCapable).toBe(isEligibleForNativeBanner(entry.build(t)))
    }
  })

  it('covers each surface the notch pipeline is made of', () => {
    const groups = new Set(DEBUG_ACTIONS.map((a) => a.group))
    expect(groups).toEqual(
      new Set(['Notifications', 'Notch cards', 'Notch queue', 'Transfers', 'AI runs'])
    )
  })
})

describe('debugActionGroups', () => {
  it('orders the groups and keeps every action', () => {
    const grouped = debugActionGroups()
    expect(grouped.map((g) => g.group)).toEqual([
      'Notifications',
      'Notch cards',
      'Notch queue',
      'Transfers',
      'AI runs',
    ])
    expect(grouped.reduce((n, g) => n + g.actions.length, 0)).toBe(DEBUG_ACTIONS.length)
  })

  it('omits a group with nothing in it rather than an empty heading', () => {
    const grouped = debugActionGroups([action('queue-clear')])
    expect(grouped.map((g) => g.group)).toEqual(['Notch queue'])
  })
})

describe('notification actions', () => {
  it('records the notification exactly as the GitHub watcher would', () => {
    // What makes these worth having over a hand-built card: the bell's unread count, the store and
    // the app's own adapter all take part, so they exercise the real path.
    run('notify-review')
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(queueIds()).toHaveLength(1)
  })

  it('can be aimed at the macOS banner instead of the notch', async () => {
    await run('notify-merged', 'native')
    expect(sendNative).toHaveBeenCalledOnce()
    expect(queueIds()).toEqual([])
  })

  it('forces the notch past whatever the display setting says', () => {
    // Otherwise the button would be testing the setting rather than the card.
    run('notify-review')
    expect(useNotchQueueStore.getState().queue.current?.forceSurface).toBe('notch')
  })

  it('carries a distinct fixture per type', () => {
    run('notify-review')
    run('notify-merged')
    const types = useNotificationStore.getState().notifications.map((n) => n.type)
    expect(types).toEqual(['pr_merged', 'review_requested'])
  })

  it('leaves the CI fixtures faceless, to exercise the initials fallback', () => {
    run('notify-ci-green')
    expect(useNotificationStore.getState().notifications[0]?.authorAvatar).toBeUndefined()
  })
})

describe('notch card actions', () => {
  it('puts a determinate progress card straight on the notch', () => {
    run('notch-progress-determinate')
    expect(useNotchQueueStore.getState().queue.current?.model).toMatchObject({
      kind: 'progress',
      ratio: 0.4,
    })
  })

  it('puts an indeterminate one on with no ratio at all', () => {
    run('notch-progress-indeterminate')
    const model = useNotchQueueStore.getState().queue.current?.model
    expect(model).toMatchObject({ kind: 'progress' })
    expect(model && 'ratio' in model ? model.ratio : undefined).toBeUndefined()
  })

  it('marks a failure card as worth a banner and a success card as not', () => {
    run('notch-status-failure')
    expect(useNotchQueueStore.getState().queue.current?.importance).toBe('key')

    useNotchQueueStore.setState({ queue: emptyNotchQueue })
    run('notch-status-success')
    expect(useNotchQueueStore.getState().queue.current?.importance).toBe('ambient')
  })

  it('offers a card whose action nobody handles, to prove that is visible', () => {
    run('notch-unhandled-action')
    expect(useNotchQueueStore.getState().queue.current?.model.actions).toEqual([
      { id: 'nobody-listens', label: 'Press me', variant: 'primary' },
    ])
  })
})

describe('queue actions', () => {
  it('sends three at once, and they queue instead of replacing each other', () => {
    run('queue-burst')
    expect(queueIds()).toHaveLength(3)
  })

  it('makes an error cut in front of a running card', () => {
    run('queue-preempt')
    expect(queueIds()).toEqual(['debug-preemptor', 'debug-preempted'])
  })

  it('empties the queue', () => {
    run('notch-status-success')
    run('queue-clear')
    expect(queueIds()).toEqual([])
  })
})

describe('transfer actions', () => {
  it('drives the real store the transfer cards read', () => {
    // Which is what lets them exercise the whole path — gating settings included — with no remote,
    // no network and no repository.
    run('transfer-fetch-running')
    const entry = Object.values(useRemoteProgressStore.getState().operations)[0]
    expect(entry).toMatchObject({ operation: 'fetch', outcome: null })
    expect(entry?.progress).toMatchObject({ phase: 'receiving', completed: 320 })
  })

  it('can finish a fetch with nothing to report', () => {
    run('transfer-fetch-empty')
    const entry = Object.values(useRemoteProgressStore.getState().operations)[0]
    expect(entry?.outcome).toEqual({ kind: 'success', updatedRefs: [] })
  })

  it('can finish one that moved branches', () => {
    run('transfer-fetch-updated')
    const entry = Object.values(useRemoteProgressStore.getState().operations)[0]
    expect(entry?.outcome?.updatedRefs).toHaveLength(2)
  })

  it('can fail a push with a realistic git message', () => {
    run('transfer-push-failed')
    const entry = Object.values(useRemoteProgressStore.getState().operations)[0]
    expect(entry?.outcome?.kind).toBe('error')
    expect(entry?.outcome?.message).toContain('non-fast-forward')
  })

  it('fails a scheduled fetch without leaving any card behind', () => {
    // The whole point of this button: proving the auto-fetch's own silent-failure contract holds
    // once it runs unattended for as long as the app is open, not just once at start-up.
    run('transfer-fetch-background-failed')
    const entry = Object.values(useRemoteProgressStore.getState().operations)[0]
    expect(entry?.background).toBe(true)
    expect(entry?.outcome?.kind).toBe('error')
  })
})
