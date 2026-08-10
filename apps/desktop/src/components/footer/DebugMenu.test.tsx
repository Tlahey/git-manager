import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyNotchQueue } from '@git-manager/notch'
import { DebugMenu } from './DebugMenu'
import { DEBUG_ACTIONS } from '../../lib/debug/debugActions'
import { useDevFlagsStore } from '../../stores/devFlags.store'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useNotificationStore } from '../../stores/notification.store'
import type { MockPR } from '../../lib/github/types'

const { sendNative } = vi.hoisted(() => ({ sendNative: vi.fn() }))
vi.mock('../../api/notification.api', () => ({
  apiSendNativeNotification: (...a: unknown[]) => sendNative(...a),
}))

const INITIAL_NOTIF = useNotificationStore.getState()

function mockPR(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 42,
    title: 'feat: a thing',
    repo: 'git-manager',
    repoUrl: 'https://github.com/Tlahey/git-manager',
    url: 'https://github.com/Tlahey/git-manager/pull/42',
    status: 'open',
    ciStatus: 'success',
    author: 'antoine',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

async function openMenu() {
  const user = userEvent.setup()
  render(<DebugMenu />)
  await user.click(screen.getByTestId('footer-debug-button'))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotificationStore.setState({ ...INITIAL_NOTIF, notifications: [], mockPRs: [] })
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
})

describe('DebugMenu', () => {
  it('is a single button until it is opened', () => {
    render(<DebugMenu />)
    expect(screen.getByTestId('footer-debug-button')).toBeInTheDocument()
    expect(screen.queryByTestId('debug-menu')).not.toBeInTheDocument()
  })

  it('renders every catalogued action', async () => {
    await openMenu()
    for (const action of DEBUG_ACTIONS) {
      expect(screen.getByTestId(`debug-action-${action.id}`)).toBeInTheDocument()
    }
  })

  it('groups them under headings', async () => {
    await openMenu()
    for (const group of ['Notifications', 'Notch cards', 'Notch queue', 'Transfers', 'AI runs']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
  })

  it('says it is a dev-only tool', async () => {
    await openMenu()
    expect(screen.getByText('DEV MODE')).toBeInTheDocument()
  })

  it('shows each action’s label and the hint about what to watch for', async () => {
    await openMenu()
    const first = DEBUG_ACTIONS[0]
    expect(screen.getByText(first.label)).toBeInTheDocument()
    expect(screen.getByText(first.hint)).toBeInTheDocument()
  })

  it('offers a card two surfaces, and an effect just one button', async () => {
    // "Does this card work" and "does it work as a macOS banner" are two questions, answered by
    // two code paths.
    await openMenu()
    expect(screen.getByTestId('debug-action-notify-merged')).toHaveTextContent('Notch')
    expect(screen.getByTestId('debug-action-notify-merged-native')).toHaveTextContent('macOS')
    expect(screen.queryByTestId('debug-action-queue-burst-native')).not.toBeInTheDocument()
  })

  it('hides the banner button for a card that has no banner form', async () => {
    // A banner is written once; a live progress card delivered as one would arrive frozen.
    await openMenu()
    expect(screen.getByTestId('debug-action-notch-progress-determinate')).toBeInTheDocument()
    expect(
      screen.queryByTestId('debug-action-notch-progress-determinate-native')
    ).not.toBeInTheDocument()
  })

  it('records nothing merely by being opened', async () => {
    // Regression: the banner capability used to be derived by *calling* each action's builder,
    // and the notification builders record into the store — so opening the menu silently added
    // four notifications to the bell.
    await openMenu()
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('says what the notch is showing and how many are waiting', async () => {
    // The queue is the first thing that makes a button look broken: one notch, one card at a
    // time, and everything sent meanwhile waits silently.
    const user = await openMenu()
    await user.click(screen.getByTestId('debug-action-notch-status-success'))
    await user.click(screen.getByTestId('debug-action-notch-unhandled-action'))

    expect(screen.getByTestId('debug-queue-readout')).toHaveTextContent('1 waiting')
  })

  it('empties the queue from the readout', async () => {
    const user = await openMenu()
    await user.click(screen.getByTestId('debug-action-notch-status-success'))
    await user.click(screen.getByTestId('debug-queue-clear'))

    expect(useNotchQueueStore.getState().queue.current).toBeNull()
  })

  it('runs an action when its button is pressed', async () => {
    const user = await openMenu()
    await user.click(screen.getByTestId('debug-action-notch-status-success'))
    expect(useNotchQueueStore.getState().queue.current?.model.id).toBe('debug-status-ok')
  })

  it('records the notification exactly as the GitHub watcher would', async () => {
    const user = await openMenu()
    await user.click(screen.getByTestId('debug-action-notify-review'))
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotchQueueStore.getState().queue.current).not.toBeNull()
  })

  it('gives the list a scrollable body, not a capped one', async () => {
    // The regression this guards is the one the panel was rebuilt for: the first version capped
    // its scroll area with `max-h-[60vh]`, and a percentage-height viewport inside a max-height
    // box resolves to `auto` — the pane grew past its container, got clipped, and could not be
    // scrolled at all. `SidePanelOverlay` documents exactly this.
    await openMenu()
    const body = screen.getByTestId('debug-menu').lastElementChild as HTMLElement

    expect(body.className).toContain('min-h-0')
    expect(body.className).toContain('flex-1')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).not.toMatch(/max-h-/)
  })

  it('closes on Escape, like any modal surface', async () => {
    const user = await openMenu()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('debug-menu')).not.toBeInTheDocument()
  })
})

describe('DebugMenu — dev flags', () => {
  it('reflects the current flag', async () => {
    useDevFlagsStore.setState({ mockGitHub: false })
    await openMenu()
    expect(screen.getByRole('switch', { name: 'Mock GitHub data' })).not.toBeChecked()
  })

  it('toggles it for the rest of the session', async () => {
    // Runtime rather than a build-time constant precisely so it can be flipped from here.
    useDevFlagsStore.setState({ mockGitHub: false })
    const user = await openMenu()
    await user.click(screen.getByRole('switch', { name: 'Mock GitHub data' }))
    expect(useDevFlagsStore.getState().mockGitHub).toBe(true)
  })

  it('opens the gated themes without a relaunch', async () => {
    // The env variable behind `pnpm dev:themes` decides this once, at boot; the switch is what
    // makes "look at glass for a second" not cost a restart.
    useDevFlagsStore.setState({ unlockThemes: false })
    const user = await openMenu()
    await user.click(screen.getByRole('switch', { name: 'Unlock every theme' }))
    expect(useDevFlagsStore.getState().unlockThemes).toBe(true)
  })
})

describe('DebugMenu — PR simulator', () => {
  it('is hidden when there are no mock PRs to mutate', async () => {
    useDevFlagsStore.setState({ mockGitHub: true })
    await openMenu()
    expect(screen.queryByTestId('debug-sim-run')).not.toBeInTheDocument()
  })

  it('is hidden when the fixtures are not what the app is reading', async () => {
    // `simulateChange` mutates `mockPRs`, and `useGitHubData` only hands those to the watcher while
    // the flag is on — so with it off this was a button that visibly did nothing.
    useDevFlagsStore.setState({ mockGitHub: false })
    useNotificationStore.setState({ mockPRs: [mockPR()] })
    await openMenu()
    expect(screen.queryByTestId('debug-sim-run')).not.toBeInTheDocument()
  })

  it('lists the mock PRs and mutates the selected one', async () => {
    // The one affordance that exercises the *detection* half of the pipeline — the registry's
    // `detect` functions diffing one poll against the next — rather than starting from a
    // ready-made notification.
    useDevFlagsStore.setState({ mockGitHub: true })
    useNotificationStore.setState({ mockPRs: [mockPR()] })
    const user = await openMenu()

    expect(screen.getByTestId('debug-sim-pr')).toHaveValue('pr-1')
    await user.click(screen.getByTestId('debug-sim-run'))

    expect(useNotificationStore.getState().mockPRs[0]).toMatchObject({
      id: 'pr-1',
      status: 'merged',
    })
  })

  it('applies whichever change is picked', async () => {
    useDevFlagsStore.setState({ mockGitHub: true })
    useNotificationStore.setState({ mockPRs: [mockPR()] })
    const user = await openMenu()

    await user.selectOptions(screen.getByTestId('debug-sim-action'), 'ci_failed')
    await user.click(screen.getByTestId('debug-sim-run'))

    expect(useNotificationStore.getState().mockPRs[0]).toMatchObject({ ciStatus: 'failure' })
  })
})
