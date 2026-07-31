import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { emptyNotchQueue } from '@git-manager/notch'
import { NotchRemoteOperations } from './NotchRemoteOperations'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useRemoteProgressStore } from '../../stores/remoteProgress.store'
import { useSettingsStore } from '../../stores/settings.store'
import type { NotificationSettings } from '@git-manager/git-types'

const INITIAL_SETTINGS = useSettingsStore.getState().settings

function setNotifications(partial: Partial<NotificationSettings>) {
  useSettingsStore.setState({
    settings: {
      ...INITIAL_SETTINGS,
      notifications: { ...INITIAL_SETTINGS.notifications!, ...partial },
    },
  })
}

function queueIds(): string[] {
  const { queue } = useNotchQueueStore.getState()
  return [
    ...(queue.current ? [queue.current.model.id] : []),
    ...queue.pending.map((entry) => entry.model.id),
  ]
}

beforeEach(() => {
  useRemoteProgressStore.setState({ operations: {} })
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  useSettingsStore.setState({ settings: INITIAL_SETTINGS })
})

describe('NotchRemoteOperations', () => {
  it('renders no markup of its own', () => {
    const { container } = render(<NotchRemoteOperations />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts a running transfer on the notch', () => {
    useRemoteProgressStore.getState().start('/repo', 'push')
    render(<NotchRemoteOperations />)
    expect(queueIds()).toEqual(['push:/repo'])
  })

  it('holds a card per transfer when several run at once', () => {
    const { start } = useRemoteProgressStore.getState()
    start('/a', 'fetch')
    start('/b', 'push')
    render(<NotchRemoteOperations />)
    expect(queueIds()).toHaveLength(2)
  })

  it('honours the per-operation setting that has existed but did nothing until now', () => {
    setNotifications({ notifyOnPush: false })
    useRemoteProgressStore.getState().start('/repo', 'push')
    render(<NotchRemoteOperations />)
    expect(queueIds()).toEqual([])
  })

  it('gates each operation independently', () => {
    setNotifications({ notifyOnPush: false, notifyOnFetch: true })
    const { start } = useRemoteProgressStore.getState()
    start('/repo', 'push')
    start('/repo', 'fetch')
    render(<NotchRemoteOperations />)
    expect(queueIds()).toEqual(['fetch:/repo'])
  })

  it('shows nothing at all when notifications are switched off', () => {
    setNotifications({ enabled: false })
    useRemoteProgressStore.getState().start('/repo', 'fetch')
    render(<NotchRemoteOperations />)
    expect(queueIds()).toEqual([])
  })

  it('replaces the live card with an outcome card, and forgets the transfer', () => {
    useRemoteProgressStore.getState().start('/repo', 'push')
    render(<NotchRemoteOperations />)

    act(() => {
      useRemoteProgressStore.getState().finish('/repo', 'push', { kind: 'success' })
    })

    expect(queueIds()).toEqual(['remote:push:/repo:done'])
    expect(useRemoteProgressStore.getState().operations).toEqual({})
  })

  it('says nothing for a fetch that moved no ref, and still cleans up', () => {
    useRemoteProgressStore.getState().start('/repo', 'fetch')
    render(<NotchRemoteOperations />)

    act(() => {
      useRemoteProgressStore
        .getState()
        .finish('/repo', 'fetch', { kind: 'success', updatedRefs: [] })
    })

    expect(queueIds()).toEqual([])
    expect(useRemoteProgressStore.getState().operations).toEqual({})
  })

  it('marks a failure as worth a banner, and a success as not', () => {
    const { start, finish } = useRemoteProgressStore.getState()
    start('/repo', 'push')
    const view = render(<NotchRemoteOperations />)

    act(() => {
      finish('/repo', 'push', { kind: 'error', message: 'rejected' })
    })
    expect(useNotchQueueStore.getState().queue.current?.importance).toBe('key')

    view.unmount()
    useNotchQueueStore.setState({ queue: emptyNotchQueue })
    useRemoteProgressStore.setState({ operations: {} })

    start('/repo', 'pull')
    render(<NotchRemoteOperations />)
    act(() => {
      finish('/repo', 'pull', { kind: 'success' })
    })
    expect(useNotchQueueStore.getState().queue.current?.importance).toBe('ambient')
  })

  it('forgets a disabled transfer too, rather than leaking its entry forever', () => {
    setNotifications({ notifyOnFetch: false })
    useRemoteProgressStore.getState().start('/repo', 'fetch')
    render(<NotchRemoteOperations />)

    act(() => {
      useRemoteProgressStore
        .getState()
        .finish('/repo', 'fetch', { kind: 'success', updatedRefs: ['main → abc'] })
    })

    expect(queueIds()).toEqual([])
    expect(useRemoteProgressStore.getState().operations).toEqual({})
  })

  it('shows no live card for a scheduled fetch', () => {
    // Regression: `useAutoFetch` fetches every minute, focused or not, so a progress card for it
    // meant the notch lighting up on a timer for a transfer nobody asked for.
    useRemoteProgressStore.getState().start('/repo', 'fetch', true)
    render(<NotchRemoteOperations />)
    expect(queueIds()).toEqual([])
  })

  it('still says what a scheduled fetch found', () => {
    // Suppressing the wait is not suppressing the news: branches having moved is the one thing an
    // automatic fetch has to report.
    useRemoteProgressStore.getState().start('/repo', 'fetch', true)
    render(<NotchRemoteOperations />)

    act(() => {
      useRemoteProgressStore
        .getState()
        .finish('/repo', 'fetch', { kind: 'success', updatedRefs: ['main → abc'] })
    })

    expect(queueIds()).toEqual(['remote:fetch:/repo:done'])
  })

  it('stays silent about a scheduled fetch that failed, and still cleans up', () => {
    // `useAutoFetch` now keeps running unattended, including while the window is unfocused for
    // hours — so a background failure (offline, a dead remote) must not become a stream of notch
    // cards or Notification Centre banners for a transfer nobody asked for. That contract is
    // `useAutoFetch`'s own: errors are swallowed there too.
    useRemoteProgressStore.getState().start('/repo', 'fetch', true)
    render(<NotchRemoteOperations />)

    act(() => {
      useRemoteProgressStore.getState().finish('/repo', 'fetch', { kind: 'error', message: 'boom' })
    })

    expect(queueIds()).toEqual([])
    expect(useRemoteProgressStore.getState().operations).toEqual({})
  })

  it('still reports a failure for a transfer the user actually asked for', () => {
    // The silence above is specific to `background` — a manual push that gets rejected must still
    // be worth a card, which `marks a failure as worth a banner` above already covers for the
    // default (non-background) case; this locks in that the two don't get conflated.
    useRemoteProgressStore.getState().start('/repo', 'push', false)
    render(<NotchRemoteOperations />)

    act(() => {
      useRemoteProgressStore.getState().finish('/repo', 'push', { kind: 'error', message: 'boom' })
    })

    expect(queueIds()).toEqual(['remote:push:/repo:done'])
  })

  it('takes the live card down when it unmounts', () => {
    useRemoteProgressStore.getState().start('/repo', 'fetch')
    const { unmount } = render(<NotchRemoteOperations />)
    unmount()
    expect(queueIds()).toEqual([])
  })
})
