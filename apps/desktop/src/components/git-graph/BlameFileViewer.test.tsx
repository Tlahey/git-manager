import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode, useEffect } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BlameHunk } from '@git-manager/git-types'
import { BlameFileViewer } from './BlameFileViewer'
import { useRepoUIStore } from '../../stores/repoUI.store'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

// Blame data + avatars are stubbed so the test is offline and deterministic.
const mockUseFileBlame = vi.fn()
vi.mock('../../hooks/useFileBlame', () => ({
  useFileBlame: (...args: unknown[]) => mockUseFileBlame(...args),
}))
vi.mock('../../hooks/useCommitAvatars', () => ({ useCommitAvatars: () => ({}) }))

// Fake Monaco: MonacoFileViewer invokes onMount with a minimal editor/monaco pair.
const setDecorations = vi.fn()
/** Layout listeners the component registered, so a test can fire Monaco's own layout pass. */
const layoutCallbacks: Array<() => void> = []
/** What `getOption(EditorOption.lineHeight)` reports — mutable so a test can prove a re-read. */
let currentLineHeight = 18
/** Opt-in: fire the just-registered layout listeners from within `onMount`, the way real Monaco
 * settles its first layout pass right after mounting. Off by default so the other tests here keep
 * an empty animation-frame queue. */
let fireLayoutOnMount = false
const fakeEditor = {
  onDidScrollChange: vi.fn(),
  onDidLayoutChange: vi.fn((cb: () => void) => {
    layoutCallbacks.push(cb)
    return { dispose: () => {} }
  }),
  getOption: () => currentLineHeight,
  getTopForLineNumber: (line: number) => (line - 1) * 18,
  getScrollTop: () => 0,
  getLayoutInfo: () => ({ height: 500, decorationsLeft: 40, decorationsWidth: 280 }),
  createDecorationsCollection: (decos: unknown) => {
    setDecorations(decos)
    return { set: setDecorations }
  },
}
const fakeMonaco = {
  Range: class {
    constructor(
      public a: number,
      public b: number,
      public c: number,
      public d: number
    ) {}
  },
  editor: { EditorOption: { lineHeight: 66 } },
}
vi.mock('./MonacoFileViewer', () => ({
  MonacoFileViewer: (props: {
    onMount?: (e: unknown, m: unknown) => void
    content: string
  }) => {
    useEffect(() => {
      const registeredBefore = layoutCallbacks.length
      props.onMount?.(fakeEditor, fakeMonaco)
      if (fireLayoutOnMount) layoutCallbacks.slice(registeredBefore).forEach((cb) => cb())
    }, [props])
    return <div data-testid="mock-monaco">{props.content}</div>
  },
}))

const HUNKS: BlameHunk[] = [
  {
    startLine: 1,
    lineCount: 2,
    commitOid: 'aaaaaaaaaaaaaaaa',
    shortOid: 'aaaaaaa',
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@x',
    timestamp: 0,
    summary: 'First',
    body: '',
  },
  {
    startLine: 3,
    lineCount: 1,
    commitOid: 'bbbbbbbbbbbbbbbb',
    shortOid: 'bbbbbbb',
    authorName: 'Alan Turing',
    authorEmail: 'alan@x',
    timestamp: 0,
    summary: 'Second',
    body: '',
  },
]

beforeEach(() => {
  setDecorations.mockClear()
  layoutCallbacks.length = 0
  currentLineHeight = 18
  fireLayoutOnMount = false
  mockUseFileBlame.mockReturnValue({ data: HUNKS })
  useRepoUIStore.setState({ selectedHistoryOid: null, activeLeftPanel: 'sidebar' })
})

function renderViewer(props: Partial<React.ComponentProps<typeof BlameFileViewer>> = {}) {
  return render(
    <BlameFileViewer
      repoPath="/repo"
      filePath="src/a.ts"
      content="line1\nline2\nline3"
      {...props}
    />
  )
}

describe('BlameFileViewer', () => {
  it('renders one avatar per blame block in the gutter', () => {
    renderViewer()
    expect(screen.getByTestId('blame-avatar-aaaaaaa')).toBeInTheDocument()
    expect(screen.getByTestId('blame-avatar-bbbbbbb')).toBeInTheDocument()
  })

  it('applies a colored border decoration per block', () => {
    renderViewer()
    expect(setDecorations).toHaveBeenCalled()
    const decos = setDecorations.mock.calls.at(-1)?.[0] as Array<{
      options: { linesDecorationsClassName: string }
    }>
    expect(decos).toHaveLength(2)
    expect(decos[0].options.linesDecorationsClassName).toMatch(/^blame-c-\d+ blame-left$/)
  })

  it('does not render the commit-name column outside blame mode', () => {
    renderViewer()
    expect(screen.queryByTestId('blame-annotation-aaaaaaa')).not.toBeInTheDocument()
  })

  it('renders the commit name + date column in blame mode with a right-side border', () => {
    renderViewer({ showBlame: true })
    const annotation = screen.getByTestId('blame-annotation-aaaaaaa')
    expect(annotation).toHaveTextContent('First')
    const decos = setDecorations.mock.calls.at(-1)?.[0] as Array<{
      options: { linesDecorationsClassName: string }
    }>
    expect(decos[0].options.linesDecorationsClassName).toMatch(/^blame-c-\d+ blame-right$/)
  })

  it('shows a commit info popover while hovering an avatar', async () => {
    const user = userEvent.setup()
    renderViewer()
    expect(screen.queryByTestId('blame-popover')).not.toBeInTheDocument()
    await user.hover(screen.getByTestId('blame-avatar-aaaaaaa'))
    const popover = screen.getByTestId('blame-popover')
    expect(popover).toHaveTextContent('Ada Lovelace')
    expect(popover).toHaveTextContent('First')
    await user.unhover(screen.getByTestId('blame-avatar-aaaaaaa'))
    expect(screen.queryByTestId('blame-popover')).not.toBeInTheDocument()
  })

  it('opens the clicked commit in the History panel', async () => {
    const user = userEvent.setup()
    renderViewer()
    await user.click(screen.getByTestId('blame-avatar-aaaaaaa'))
    expect(useRepoUIStore.getState().activeLeftPanel).toBe('history')
    expect(useRepoUIStore.getState().selectedHistoryOid).toBe('aaaaaaaaaaaaaaaa')
  })

  it('shows nothing in the gutter when there is no blame data', () => {
    mockUseFileBlame.mockReturnValue({ data: undefined })
    renderViewer()
    expect(screen.queryByTestId('blame-avatar-aaaaaaa')).not.toBeInTheDocument()
  })
})

describe('BlameFileViewer — StrictMode double-mount', () => {
  // The app renders under `<React.StrictMode>` (main.tsx), which double-invokes effects on mount
  // (mount → cleanup → mount). `scheduleTick` dedupes with a ref that only its own frame clears,
  // so a cleanup that cancels the pending frame without clearing that ref latches the guard and
  // the gutter stops tracking scroll/layout for good. Owning the frame queue here (rather than
  // leaning on jsdom's real rAF + waitFor) keeps the cancel-then-reschedule sequence exact and
  // stops stray frames leaking into the tests above.
  let nextFrameId = 1
  const frames = new Map<number, () => void>()

  beforeEach(() => {
    nextFrameId = 1
    frames.clear()
    fireLayoutOnMount = true
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      const id = nextFrameId++
      frames.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function flushFrames() {
    act(() => {
      const queued = [...frames.values()]
      frames.clear()
      queued.forEach((cb) => cb())
    })
  }

  it('still reschedules a tick after the mount cleanup cancelled the first frame', () => {
    render(
      <StrictMode>
        <BlameFileViewer repoPath="/repo" filePath="src/a.ts" content={'line1\nline2\nline3'} />
      </StrictMode>
    )

    // The cleanup between the two mounts cancelled the frame the first mount had queued.
    flushFrames()

    // A later Monaco layout pass must still be able to queue one. `lineHeight` is the observable
    // proof: outside of mount, only the scheduled frame ever re-reads it.
    currentLineHeight = 30
    act(() => layoutCallbacks.forEach((cb) => cb()))
    flushFrames()

    expect(screen.getByTestId('blame-gutter')).toHaveStyle({ width: '30px' })
  })
})
