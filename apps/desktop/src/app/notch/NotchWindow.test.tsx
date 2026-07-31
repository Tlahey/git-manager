import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HALO_MARGIN, measureCardHeight, type NotchModel } from '@git-manager/notch'
import { NotchWindow } from './NotchWindow'
import {
  NOTCH_ACTION_EVENT,
  NOTCH_DISMISSED_EVENT,
  NOTCH_UPDATE_EVENT,
  NOTIFICATION_ACTIVATED_EVENT,
} from '../../api/notification.api'
import type { NotchPayload } from '../../lib/notifications/notchWindow'

const {
  emitMock,
  listenMock,
  showMain,
  focusMain,
  getByLabel,
  openUrlMock,
  resizeMock,
  hostCalls,
  hostOptions,
  updateHandlers,
} = vi.hoisted(() => ({
  emitMock: vi.fn(() => Promise.resolve()),
  // Typed parameters on purpose: an untyped `vi.fn(() => …)` cannot take a two-argument
  // `mockImplementation` later, which is how the update handler is captured below.
  listenMock: vi.fn((_event: unknown, _handler: unknown) => Promise.resolve(() => {})),
  showMain: vi.fn(() => Promise.resolve()),
  focusMain: vi.fn(() => Promise.resolve()),
  getByLabel: vi.fn(),
  openUrlMock: vi.fn(() => Promise.resolve()),
  resizeMock: vi.fn(() => Promise.resolve()),
  hostCalls: [] as string[],
  hostOptions: { current: null as { windowX: number; withSound: boolean } | null },
  updateHandlers: { current: [] as ((p: { model: NotchModel }) => void)[] },
}))

vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock, listen: listenMock }))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: { getByLabel },
}))

vi.mock('../../lib/openUrl', () => ({ openUrl: openUrlMock }))

// A recording host in place of the real window driver: the presenter's own sequence still runs,
// but nothing reaches Tauri.
vi.mock('../../lib/notifications/tauriNotchHost', () => ({
  NOTCH_SOUND: 'Pop',
  resizeNotchWindow: (...a: unknown[]) => resizeMock(...(a as [])),
  createTauriNotchHost: (options: { windowX: number; withSound: boolean }) => {
    hostOptions.current = options
    return {
      prepare: () => hostCalls.push('prepare'),
      show: () => hostCalls.push('show'),
      setY: () => hostCalls.push('setY'),
      close: () => hostCalls.push('close'),
    }
  },
}))

const payload: NotchPayload = {
  model: {
    kind: 'event',
    id: 'pr-231',
    tone: 'highlight',
    eyebrow: 'PULL REQUEST MERGED',
    context: 'Tlahey/git-manager',
    title: 'feat(notch): extract the notification card',
    subtitle: '@Tlahey',
    badge: '#231',
    actions: [
      { id: 'activate', label: 'Open in app', variant: 'primary' },
      { id: 'open-external', label: 'GitHub' },
    ],
  },
  iconId: 'pr_merged',
  route: {
    kind: 'pull-request',
    prNumber: 231,
    prId: 'pr-231',
    repo: 'git-manager',
    targetTab: 'prs',
  },
  externalUrl: 'https://github.com/Tlahey/git-manager/pull/231',
  windowX: 510,
  windowY: -27,
}

async function renderWindow(overrides: Partial<NotchPayload> = {}) {
  render(<NotchWindow {...payload} {...overrides} />)
  // Let the presenter's awaited host calls settle so the card is on screen.
  await act(async () => {
    await Promise.resolve()
  })
}

/** Fires the `notch://update` the main window's queue sends to replace a card in place. */
async function pushUpdate(model: NotchModel) {
  await act(async () => {
    for (const handler of updateHandlers.current) handler({ model })
  })
}

beforeEach(() => {
  hostCalls.length = 0
  hostOptions.current = null
  updateHandlers.current = []
  vi.clearAllMocks()
  getByLabel.mockResolvedValue({ show: showMain, setFocus: focusMain })
  // Capture whatever the window subscribes to `notch://update` with.
  listenMock.mockImplementation((event: unknown, handler: unknown) => {
    if (event === NOTCH_UPDATE_EVENT) {
      updateHandlers.current.push((payload) =>
        (handler as (e: { payload: { model: NotchModel } }) => void)({ payload })
      )
    }
    return Promise.resolve(() => {})
  })
})

describe('NotchWindow', () => {
  it('renders the card the payload describes', async () => {
    await renderWindow()
    expect(screen.getByText('PULL REQUEST MERGED')).toBeInTheDocument()
    expect(screen.getByText('Tlahey/git-manager')).toBeInTheDocument()
    expect(screen.getByText('feat(notch): extract the notification card')).toBeInTheDocument()
    expect(screen.getByText('#231')).toBeInTheDocument()
  })

  it('hands the host the window x it was given, so the slide keeps a straight line', async () => {
    await renderWindow()
    expect(hostOptions.current?.windowX).toBe(510)
  })

  it('runs the entrance: prepare, park, reveal', async () => {
    await renderWindow()
    expect(hostCalls.slice(0, 3)).toEqual(['prepare', 'setY', 'show'])
  })

  it('emits the same activation event the OS banner produces, then surfaces the main window', async () => {
    // This window has its own Zustand instances — navigating from here would mutate state nobody
    // reads, so the routing decision has to go back to the main window.
    await renderWindow()
    await userEvent.click(screen.getByRole('button', { name: 'Open in app' }))

    expect(emitMock).toHaveBeenCalledWith(NOTIFICATION_ACTIVATED_EVENT, payload.route)
    expect(showMain).toHaveBeenCalled()
    expect(focusMain).toHaveBeenCalled()
  })

  it('activates on a click on the card itself, not only on the button', async () => {
    await renderWindow()
    await userEvent.click(screen.getByText('feat(notch): extract the notification card'))
    expect(emitMock).toHaveBeenCalledWith(NOTIFICATION_ACTIVATED_EVENT, payload.route)
  })

  it('opens the external URL for the GitHub action', async () => {
    await renderWindow()
    await userEvent.click(screen.getByRole('button', { name: 'GitHub' }))
    expect(openUrlMock).toHaveBeenCalledWith(payload.externalUrl)
    expect(emitMock).not.toHaveBeenCalledWith(NOTIFICATION_ACTIVATED_EVENT, expect.anything())
  })

  it('hands an action it does not know about to the main window instead of dropping it', async () => {
    // The extension point for the cards this window does not exist for yet — a hook's "Show
    // output", a task's "Restart".
    await renderWindow({
      model: {
        ...payload.model,
        actions: [{ id: 'show-output', label: 'Show output', variant: 'primary' }],
      },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Show output' }))
    // The card's id travels with it, so a handler can tell which operation the press belongs to.
    expect(emitMock).toHaveBeenCalledWith(NOTCH_ACTION_EVENT, {
      actionId: 'show-output',
      notchId: 'pr-231',
    })
  })

  it('does nothing but dismiss when a card carries no route', async () => {
    await renderWindow({ route: undefined })
    await userEvent.click(screen.getByRole('button', { name: 'Open in app' }))
    expect(emitMock).not.toHaveBeenCalledWith(NOTIFICATION_ACTIVATED_EVENT, expect.anything())
    // The close lands after the exit slide, which runs on real frames.
    await vi.waitFor(() => expect(hostCalls).toContain('close'))
  })

  it('closes the window from the ✕ in the notch band', async () => {
    await renderWindow()
    await userEvent.click(screen.getByTestId('notch-close'))
    await vi.waitFor(() => expect(hostCalls).toContain('close'))
  })

  it('names the close button with the app’s own translated label', async () => {
    await renderWindow()
    expect(screen.getByTestId('notch-close')).toHaveAccessibleName('Close')
  })

  it('tells the queue it dismissed itself, so the next card can be promoted', async () => {
    // The queue lives in the main window (this one dies with its card), so without this event it
    // would stall on the first notification forever.
    await renderWindow()
    await userEvent.click(screen.getByTestId('notch-close'))

    await vi.waitFor(() =>
      expect(emitMock).toHaveBeenCalledWith(NOTCH_DISMISSED_EVENT, { notchId: 'pr-231' })
    )
  })

  it('replaces the card in place when the queue pushes an update', async () => {
    // Coalescing is only real if the card can change without being torn down — otherwise a
    // progress tick would replay the entrance animation on every frame.
    await renderWindow()
    await pushUpdate({ ...payload.model, title: 'feat(notch): now with a queue' })

    expect(screen.getByText('feat(notch): now with a queue')).toBeInTheDocument()
    expect(hostCalls.filter((c) => c === 'show')).toHaveLength(1)
  })

  it('ignores an update meant for a different card', async () => {
    // Events reach every webview; the queue coalesces on id, so anything else is not ours.
    await renderWindow()
    await pushUpdate({ ...payload.model, id: 'someone-else', title: 'not for us' })

    expect(screen.queryByText('not for us')).not.toBeInTheDocument()
  })

  it('resizes the window to the card it is now showing', async () => {
    // A progress card that ends as a failure grows an output block; a window still sized for the
    // old model would simply clip it.
    await renderWindow()
    const taller: NotchModel = {
      kind: 'status',
      id: payload.model.id,
      tone: 'error',
      eyebrow: 'PRE-COMMIT',
      title: 'lint-staged failed',
      outputLines: ['a', 'b', 'c'],
    }
    await pushUpdate(taller)

    expect(resizeMock).toHaveBeenLastCalledWith(
      expect.any(Number),
      measureCardHeight(taller) + HALO_MARGIN * 2
    )
  })

  it('resizes with the real per-machine band height when the payload carries one', async () => {
    // `get_notch_metrics`'s answer, carried in the URL by `openNotchWindow` — not re-read here.
    await renderWindow({ bandHeight: 38 })

    expect(resizeMock).toHaveBeenLastCalledWith(
      expect.any(Number),
      measureCardHeight(payload.model, 38) + HALO_MARGIN * 2
    )
  })

  it('reserves the real per-machine band height on the rendered card', async () => {
    await renderWindow({ bandHeight: 38 })
    expect(screen.getByTestId('notch-band')).toHaveStyle({ height: '39px' })
  })

  it('never times out a live progress card', async () => {
    // A clone at 40 % that vanishes after five seconds has told the user nothing and taken away
    // the only thing tracking the operation.
    render(
      <NotchWindow
        {...payload}
        model={{
          kind: 'progress',
          id: 'clone',
          tone: 'running',
          eyebrow: 'CLONING',
          title: 'Receiving objects',
          ratio: 0.4,
        }}
      />
    )
    await act(async () => {
      await Promise.resolve()
    })

    // Fake timers go in *after* the entrance has settled, and the log is cleared first. Installed
    // before, they would also drive whatever rAF work an earlier test in this file left pending —
    // including an exit animation whose `close` would then land in this shared array and read as
    // this card timing out.
    hostCalls.length = 0
    vi.useFakeTimers()
    await act(async () => {
      vi.advanceTimersByTime(600_000)
    })
    vi.useRealTimers()

    expect(hostCalls).not.toContain('close')
  })

  it('renders a progress card without an activation route', async () => {
    await renderWindow({
      model: {
        kind: 'progress',
        id: 'clone',
        tone: 'running',
        eyebrow: 'CLONING',
        title: 'Receiving objects',
        ratio: 0.4,
      },
      route: undefined,
      externalUrl: undefined,
    })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
  })
})
