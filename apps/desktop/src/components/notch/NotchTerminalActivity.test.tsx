import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { emptyNotchQueue } from '@git-manager/notch'
import type { NotificationSettings } from '@git-manager/git-types'
import { NotchTerminalActivity } from './NotchTerminalActivity'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useTerminalStore } from '../../stores/terminal.store'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState().settings
const INITIAL_TERMINAL = useTerminalStore.getState()

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
  useTerminalStore.setState(
    { ...INITIAL_TERMINAL, sessions: [], activeId: null, finished: {}, lastActivity: {} },
    true
  )
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  useSettingsStore.setState({ settings: INITIAL_SETTINGS })
})

describe('NotchTerminalActivity', () => {
  it('renders no markup of its own', () => {
    const { container } = render(<NotchTerminalActivity />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts a finished session on the notch, naming its command', () => {
    useTerminalStore.setState({
      sessions: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }],
      finished: { a: { command: 'claude' } },
    })
    render(<NotchTerminalActivity />)
    expect(queueIds()).toEqual(['terminal:finished:a'])
  })

  it('holds a card per session when several finish at once', () => {
    useTerminalStore.setState({
      sessions: [
        { id: 'a', title: 'zsh 1', cwd: '/repo' },
        { id: 'b', title: 'zsh 2', cwd: '/repo/.worktrees/feature' },
      ],
      finished: { a: { command: 'claude' }, b: { command: 'pnpm test' } },
    })
    render(<NotchTerminalActivity />)
    expect(queueIds()).toHaveLength(2)
  })

  it('honours the notifyOnTerminalFinished toggle', () => {
    setNotifications({ notifyOnTerminalFinished: false })
    useTerminalStore.setState({
      sessions: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }],
      finished: { a: { command: 'claude' } },
    })
    render(<NotchTerminalActivity />)
    expect(queueIds()).toEqual([])
  })

  it('shows nothing at all when notifications are switched off globally', () => {
    setNotifications({ enabled: false })
    useTerminalStore.setState({
      sessions: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }],
      finished: { a: { command: 'claude' } },
    })
    render(<NotchTerminalActivity />)
    expect(queueIds()).toEqual([])
  })

  it('fires again for a session that finishes a second time, after being seen once', () => {
    useTerminalStore.setState({
      sessions: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }],
      finished: { a: { command: 'claude' } },
    })
    render(<NotchTerminalActivity />)
    expect(queueIds()).toEqual(['terminal:finished:a'])

    act(() => {
      useTerminalStore.getState().markSeen('a')
    })
    useNotchQueueStore.setState({ queue: emptyNotchQueue })

    act(() => {
      useTerminalStore.setState({ finished: { a: { command: 'pnpm test' } } })
    })
    expect(queueIds()).toEqual(['terminal:finished:a'])
  })

  it('leaves an already-enqueued card in place once the session is marked seen', () => {
    // Unlike a live progress card, this is a one-shot outcome: it outlives the transition that
    // produced it, the same way `NotchRemoteOperations`'s outcome card does.
    useTerminalStore.setState({
      sessions: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }],
      finished: { a: { command: 'claude' } },
    })
    render(<NotchTerminalActivity />)

    act(() => {
      useTerminalStore.getState().markSeen('a')
    })
    expect(queueIds()).toEqual(['terminal:finished:a'])
  })
})
