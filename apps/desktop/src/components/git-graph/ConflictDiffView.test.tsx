import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'

const { useMergeView } = vi.hoisted(() => ({ useMergeView: vi.fn() }))
vi.mock('../../hooks/useMergeView', () => ({ useMergeView }))

vi.mock('../../api/conflict.api', () => ({
  apiResolveConflict: vi.fn(),
  apiResolveConflictBinary: vi.fn(),
}))

const { mergeEditorMock, lastMergeEditorProps } = vi.hoisted(() => ({
  mergeEditorMock: { applyAutoMerge: vi.fn(), getCenterValue: vi.fn(() => 'center content') },
  lastMergeEditorProps: { current: null as null | { onPendingCountChange: (n: number) => void } },
}))
vi.mock('../merge-editor/ThreeWayMergeEditor', () => {
  const ThreeWayMergeEditor = forwardRef(
    (props: { onPendingCountChange: (n: number) => void }, ref) => {
      lastMergeEditorProps.current = props
      useImperativeHandle(ref, () => mergeEditorMock)
      return <div data-testid="three-way-merge-editor" />
    }
  )
  ThreeWayMergeEditor.displayName = 'ThreeWayMergeEditor'
  return { ThreeWayMergeEditor }
})

import { apiResolveConflict, apiResolveConflictBinary } from '../../api/conflict.api'
import { ConflictDiffView } from './ConflictDiffView'

const mockedResolve = apiResolveConflict as unknown as ReturnType<typeof vi.fn>
const mockedResolveBinary = apiResolveConflictBinary as unknown as ReturnType<typeof vi.fn>

function renderView(props: Partial<React.ComponentProps<typeof ConflictDiffView>> = {}) {
  const onClose = vi.fn()
  const onResolved = vi.fn()
  const utils = render(
    <ConflictDiffView
      repoPath="/repo"
      filePath="src/a.ts"
      onClose={onClose}
      onResolved={onResolved}
      {...props}
    />
  )
  return { ...utils, onClose, onResolved }
}

beforeEach(() => {
  vi.clearAllMocks()
  mergeEditorMock.getCenterValue.mockReturnValue('center content')
  lastMergeEditorProps.current = null
})

describe('ConflictDiffView — loading/path', () => {
  it('shows a loading spinner while the merge view loads', () => {
    useMergeView.mockReturnValue({ data: undefined, isLoading: true })
    renderView()
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it('splits the file path into a dimmed directory and the file name', () => {
    useMergeView.mockReturnValue({ data: { renderable: true, isBinary: false }, isLoading: false })
    renderView({ filePath: 'src/components/a.ts' })
    expect(screen.getByText('src/components/')).toBeInTheDocument()
    expect(screen.getByText('a.ts')).toBeInTheDocument()
  })

  it('closes via the back button', async () => {
    useMergeView.mockReturnValue({ data: { renderable: true, isBinary: false }, isLoading: false })
    const user = userEvent.setup()
    const { onClose } = renderView()
    await user.click(screen.getByTitle("Back to graph"))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ConflictDiffView — renderable content', () => {
  beforeEach(() => {
    useMergeView.mockReturnValue({ data: { renderable: true, isBinary: false }, isLoading: false })
  })

  it('renders the three-way merge editor and toolbar controls', () => {
    renderView()
    expect(screen.getByTestId('three-way-merge-editor')).toBeInTheDocument()
    expect(screen.getByText("Apply non-conflicting changes")).toBeInTheDocument()
    expect(screen.getByText("Mark file resolved")).toBeInTheDocument()
  })

  it('shows the remaining-conflicts count reported by the merge editor', () => {
    renderView()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(3))
    expect(screen.getByText("3 conflict(s) remaining")).toBeInTheDocument()
  })

  it('disables "mark resolved" while conflicts remain, enables it once they reach zero', () => {
    renderView()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(2))
    expect(screen.getByText("Mark file resolved").closest('button')).toBeDisabled()

    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    expect(screen.getByText("Mark file resolved").closest('button')).toBeEnabled()
  })

  it('applies non-conflicting hunks via the merge editor ref', async () => {
    mergeEditorMock.applyAutoMerge.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText("Apply non-conflicting changes"))
    expect(mergeEditorMock.applyAutoMerge).toHaveBeenCalledOnce()
  })

  it("marks resolved with the merge editor's center value and calls onResolved", async () => {
    mockedResolve.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { onResolved } = renderView()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    await user.click(screen.getByText("Mark file resolved"))

    expect(mockedResolve).toHaveBeenCalledWith('/repo', 'src/a.ts', 'center content')
    expect(onResolved).toHaveBeenCalledOnce()
  })

  it('shows an inline error when marking resolved fails', async () => {
    mockedResolve.mockRejectedValue(new Error('resolve failed'))
    const user = userEvent.setup()
    const { onResolved } = renderView()
    act(() => lastMergeEditorProps.current!.onPendingCountChange(0))
    await user.click(screen.getByText("Mark file resolved"))

    expect(await screen.findByText(/resolve failed/)).toBeInTheDocument()
    expect(onResolved).not.toHaveBeenCalled()
  })
})

describe('ConflictDiffView — binary/delete/rename fallback', () => {
  it('shows the binary-conflict message with keep-ours/keep-theirs actions', () => {
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: true }, isLoading: false })
    renderView()
    expect(screen.getByText("Binary file conflict")).toBeInTheDocument()
    expect(screen.getByText("Keep current version")).toBeInTheDocument()
    expect(screen.getByText("Keep incoming version")).toBeInTheDocument()
    expect(screen.queryByTestId('three-way-merge-editor')).not.toBeInTheDocument()
  })

  it('shows the delete-conflict message for a delete conflictKind', () => {
    useMergeView.mockReturnValue({
      data: { renderable: false, isBinary: false, conflictKind: 'delete' },
      isLoading: false,
    })
    renderView()
    expect(screen.getByText("One side deleted this file")).toBeInTheDocument()
  })

  it('keeps "ours" via the binary resolver and calls onResolved', async () => {
    mockedResolveBinary.mockResolvedValue(undefined)
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: true }, isLoading: false })
    const user = userEvent.setup()
    const { onResolved } = renderView()
    await user.click(screen.getByText("Keep current version"))

    expect(mockedResolveBinary).toHaveBeenCalledWith('/repo', 'src/a.ts', 'ours')
    expect(onResolved).toHaveBeenCalledOnce()
  })

  it('shows an inline error when keep-side resolution fails', async () => {
    mockedResolveBinary.mockRejectedValue(new Error('keep failed'))
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: true }, isLoading: false })
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText("Keep incoming version"))

    expect(await screen.findByText(/keep failed/)).toBeInTheDocument()
  })

  it('shows an "unparseable" message when neither renderable nor binary/delete/rename', () => {
    useMergeView.mockReturnValue({ data: { renderable: false, isBinary: false }, isLoading: false })
    renderView()
    expect(screen.getByText("Could not parse conflict markers — resolve this file externally")).toBeInTheDocument()
  })
})
