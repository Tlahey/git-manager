import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { forwardRef, useImperativeHandle } from 'react'

const { useMergeView } = vi.hoisted(() => ({ useMergeView: vi.fn() }))
vi.mock('../../hooks/useMergeView', () => ({ useMergeView }))
vi.mock('../../api/conflict.api', () => ({
  apiResolveConflict: vi.fn(),
  apiResolveConflictBinary: vi.fn(),
}))

const { closeWindow, emitMock } = vi.hoisted(() => ({ closeWindow: vi.fn(), emitMock: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close: closeWindow }) }))
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock }))

const { mergeEditorMock, lastMergeEditorProps, refRegistration } = vi.hoisted(() => ({
  mergeEditorMock: { applyAutoMerge: vi.fn(), getCenterValue: vi.fn(() => 'center content') },
  lastMergeEditorProps: { current: null as null | { onPendingCountChange: (n: number) => void } },
  // Lets one test render the editor while leaving the parent's ref null — the state a mounted
  // resolver that hasn't finished wiring its imperative handle is in.
  refRegistration: { detached: false },
}))
vi.mock('./ThreeWayMergeEditor', () => {
  const ThreeWayMergeEditor = forwardRef(
    (props: { onPendingCountChange: (n: number) => void }, ref) => {
      lastMergeEditorProps.current = props
      useImperativeHandle(ref, () => (refRegistration.detached ? null : mergeEditorMock))
      return <div data-testid="three-way-merge-editor" />
    }
  )
  ThreeWayMergeEditor.displayName = 'ThreeWayMergeEditor'
  return { ThreeWayMergeEditor }
})

import { apiResolveConflict, apiResolveConflictBinary } from '../../api/conflict.api'
import { renderWithLanguage } from '../../test/i18n'
import { ConflictMergeWindowContent } from './ConflictMergeWindow'

const mockedResolve = apiResolveConflict as unknown as ReturnType<typeof vi.fn>
const mockedResolveBinary = apiResolveConflictBinary as unknown as ReturnType<typeof vi.fn>

function renderWindow(props: Partial<{ repoPath: string; filePath: string }> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConflictMergeWindowContent repoPath="/repo" filePath="src/a.ts" {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mergeEditorMock.getCenterValue.mockReturnValue('center content')
  lastMergeEditorProps.current = null
  refRegistration.detached = false
})

describe('ConflictMergeWindow — loading/renderable content', () => {
  it('shows a loading indicator while the merge view loads', () => {
    useMergeView.mockReturnValue({ data: undefined, isLoading: true })
    renderWindow()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders the three-way merge editor with no header/toolbar', () => {
    useMergeView.mockReturnValue({
      data: { renderable: true, isBinary: false, oursText: 'o', theirsText: 't' },
      isLoading: false,
    })
    renderWindow()
    expect(screen.getByTestId('three-way-merge-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('merge-auto-merge-button')).not.toBeInTheDocument()
  })
})

describe('ConflictMergeWindow — binary/delete/rename fallback', () => {
  it('shows the binary-conflict message with keep-ours/keep-theirs', () => {
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: true }, isLoading: false })
    renderWindow()
    expect(screen.getByText('Binary file conflict')).toBeInTheDocument()
  })

  it('keeps "ours" for a binary conflict, emits, and closes the window', async () => {
    mockedResolveBinary.mockResolvedValue(undefined)
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: true }, isLoading: false })
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('keep-ours-button'))

    expect(mockedResolveBinary).toHaveBeenCalledWith('/repo', 'src/a.ts', 'ours')
    expect(emitMock).toHaveBeenCalledWith('conflict-resolved', {
      repoPath: '/repo',
      filePath: 'src/a.ts',
    })
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('keeps "theirs" for a delete conflict', async () => {
    mockedResolveBinary.mockResolvedValue(undefined)
    useMergeView.mockReturnValue({
      data: { renderable: false, isBinary: false, conflictKind: 'delete' },
      isLoading: false,
    })
    const user = userEvent.setup()
    renderWindow()
    expect(screen.getByText('One side deleted this file')).toBeInTheDocument()
    await user.click(screen.getByTestId('keep-theirs-button'))
    expect(mockedResolveBinary).toHaveBeenCalledWith('/repo', 'src/a.ts', 'theirs')
  })

  it('shows an inline error and does not close on failure', async () => {
    mockedResolveBinary.mockRejectedValue(new Error('keep failed'))
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: true }, isLoading: false })
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('keep-ours-button'))
    expect(await screen.findByText(/keep failed/)).toBeInTheDocument()
    expect(closeWindow).not.toHaveBeenCalled()
  })

  it('shows an "unparseable" message when neither renderable nor binary/delete/rename', () => {
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: false }, isLoading: false })
    renderWindow()
    expect(
      screen.getByText('Could not parse conflict markers — resolve this file externally')
    ).toBeInTheDocument()
  })
})

/* Applying writes the result pane's content over the conflicted file and stages it (services/
 * git_conflict.rs truncates the working-tree path to whatever it is handed). Each state below
 * renders no result pane, so there is nothing to apply — and Apply used to stay enabled through
 * all of them, sending the empty-string fallback and emptying the user's file. */
describe('ConflictMergeWindow — Apply without a result pane', () => {
  it.each([
    ['while the merge view is still loading', { data: undefined, isLoading: true }],
    ['for a binary conflict', { data: { renderable: false, isBinary: true }, isLoading: false }],
    [
      'for a delete conflict',
      { data: { renderable: false, isBinary: false, conflictKind: 'delete' }, isLoading: false },
    ],
    [
      'for an unparseable conflict',
      { data: { renderable: false, isBinary: false }, isLoading: false },
    ],
  ])('disables Apply %s', (_state, viewResult) => {
    useMergeView.mockReturnValue(viewResult)
    renderWindow()

    expect(screen.queryByTestId('three-way-merge-editor')).not.toBeInTheDocument()
    expect(screen.getByTestId('merge-apply')).toBeDisabled()
  })

  it('writes nothing when the editor is mounted but its ref never registered', async () => {
    // The disabled state above is a UI affordance, not a guarantee: handleApply refuses on its
    // own rather than falling back to an empty result. Here Apply is genuinely enabled.
    refRegistration.detached = true
    useMergeView.mockReturnValue({
      data: { renderable: true, isBinary: false, oursText: 'o', theirsText: 't' },
      isLoading: false,
    })
    const user = userEvent.setup()
    renderWindow()

    expect(screen.getByTestId('merge-apply')).toBeEnabled()
    await user.click(screen.getByTestId('merge-apply'))

    expect(mockedResolve).not.toHaveBeenCalled()
    expect(emitMock).not.toHaveBeenCalled()
    expect(closeWindow).not.toHaveBeenCalled()
  })
})

describe('ConflictMergeWindow — Apply / Cancel', () => {
  beforeEach(() => {
    useMergeView.mockReturnValue({
      data: { renderable: true, isBinary: false, oursText: 'ours text', theirsText: 'theirs text' },
      isLoading: false,
    })
  })

  it('disables Apply while conflicts remain, enables once resolved', () => {
    renderWindow()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(2))
    expect(screen.getByTestId('merge-apply')).toBeDisabled()

    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    expect(screen.getByTestId('merge-apply')).toBeEnabled()
  })

  it("applies with the merge editor's center value, emits, and closes", async () => {
    mockedResolve.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWindow()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    await user.click(screen.getByTestId('merge-apply'))

    expect(mockedResolve).toHaveBeenCalledWith('/repo', 'src/a.ts', 'center content')
    expect(emitMock).toHaveBeenCalledWith('conflict-resolved', {
      repoPath: '/repo',
      filePath: 'src/a.ts',
    })
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('still applies an empty result — emptying the file is a real resolution', async () => {
    // The guard against writing nothing is on the editor's absence, never on its value: both
    // sides deleting the same lines leaves a legitimately empty file, and refusing to write it
    // would strand the conflict unresolved.
    mockedResolve.mockResolvedValue(undefined)
    mergeEditorMock.getCenterValue.mockReturnValue('')
    const user = userEvent.setup()
    renderWindow()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    await user.click(screen.getByTestId('merge-apply'))

    expect(mockedResolve).toHaveBeenCalledWith('/repo', 'src/a.ts', '')
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('shows an inline error and does not close when apply fails', async () => {
    mockedResolve.mockRejectedValue(new Error('resolve failed'))
    const user = userEvent.setup()
    renderWindow()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    await user.click(screen.getByTestId('merge-apply'))
    expect(await screen.findByText(/resolve failed/)).toBeInTheDocument()
    expect(closeWindow).not.toHaveBeenCalled()
  })

  it('closes the window from Cancel without resolving', async () => {
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('merge-cancel'))
    expect(closeWindow).toHaveBeenCalledOnce()
    expect(mockedResolve).not.toHaveBeenCalled()
  })
})

describe('ConflictMergeWindow — Accept Left/Right with discard confirmation', () => {
  beforeEach(() => {
    useMergeView.mockReturnValue({
      data: { renderable: true, isBinary: false, oursText: 'ours text', theirsText: 'theirs text' },
      isLoading: false,
    })
  })

  it('opens a discard-confirmation dialog when Accept Left is clicked', async () => {
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('merge-accept-left'))
    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-discard-and-apply')).toHaveTextContent('left')
  })

  it('names the side in the reader’s own language, not the internal identifier', async () => {
    // 'left'/'right' are internal discriminants. Interpolating one raw would leave the English
    // word inside an otherwise-French sentence, which is why the side has its own keys.
    const user = userEvent.setup()
    renderWithLanguage(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConflictMergeWindowContent repoPath="/repo" filePath="src/a.ts" />
      </QueryClientProvider>,
      'fr'
    )
    await user.click(screen.getByTestId('merge-accept-left'))

    expect(screen.getByText('Abandonner les modifications ?')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-discard-and-apply')).toHaveTextContent('la gauche')
    expect(screen.getByTestId('dialog-discard-and-apply')).not.toHaveTextContent('left')
  })

  it('"Continue merge" dismisses the dialog without resolving', async () => {
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('merge-accept-right'))
    await user.click(screen.getByTestId('dialog-continue-merge'))
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument()
    expect(mockedResolve).not.toHaveBeenCalled()
  })

  it('discarding and applying "left" resolves with theirsText (left pane = theirs)', async () => {
    mockedResolve.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('merge-accept-left'))
    await user.click(screen.getByTestId('dialog-discard-and-apply'))
    expect(mockedResolve).toHaveBeenCalledWith('/repo', 'src/a.ts', 'theirs text')
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('discarding and applying "right" resolves with oursText (right pane = ours)', async () => {
    mockedResolve.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('merge-accept-right'))
    await user.click(screen.getByTestId('dialog-discard-and-apply'))
    expect(mockedResolve).toHaveBeenCalledWith('/repo', 'src/a.ts', 'ours text')
  })

  it('keeps the dialog open and shows an error if discard-and-apply fails', async () => {
    mockedResolve.mockRejectedValue(new Error('discard apply failed'))
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('merge-accept-left'))
    await user.click(screen.getByTestId('dialog-discard-and-apply'))
    expect(await screen.findByText(/discard apply failed/)).toBeInTheDocument()
    expect(closeWindow).not.toHaveBeenCalled()
  })
})
