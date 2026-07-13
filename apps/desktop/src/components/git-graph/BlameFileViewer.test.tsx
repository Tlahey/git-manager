import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
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
const fakeEditor = {
  onDidScrollChange: vi.fn(),
  onDidLayoutChange: vi.fn(),
  getOption: () => 18,
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
      props.onMount?.(fakeEditor, fakeMonaco)
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
