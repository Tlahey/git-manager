import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BisectState, GitStatus } from '@git-manager/git-types'

let bisect: BisectState | undefined
let status: GitStatus
let hasManifest: boolean | undefined
vi.mock('../../hooks/useBisectState', () => ({
  useBisectState: () => ({ data: bisect }),
}))
vi.mock('../../hooks/useGitStatus', () => ({
  useGitStatus: () => ({ data: status }),
}))
vi.mock('../../hooks/usePackageHealth', () => ({
  useHasPackageManifest: () => ({ data: hasManifest }),
}))

import { ToolsMenu } from './ToolsMenu'
import { useBisectUIStore } from '../../stores/bisectUI.store'
import { useStashDialogStore } from '../../stores/stashDialog.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { usePackageHealthStore } from '../../stores/packageHealth.store'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'

const cleanStatus: GitStatus = { staged: [], unstaged: [], untracked: [], conflicted: [] }
const dirtyStatus: GitStatus = {
  staged: [],
  unstaged: [{ path: 'a.txt', status: 'modified' }],
  untracked: [],
  conflicted: [],
}

function idleState(overrides: Partial<BisectState> = {}): BisectState {
  return {
    active: false,
    badTerm: 'bad',
    goodTerm: 'good',
    goodOids: [],
    skippedOids: [],
    ...overrides,
  }
}

describe('ToolsMenu', () => {
  beforeEach(() => {
    bisect = idleState()
    status = cleanStatus
    hasManifest = true
    usePackageHealthStore.setState({ open: false, selection: { kind: 'overview' } })
    usePatchWorkspaceStore.getState().close()
    useBisectUIStore.setState({
      setupActive: false,
      activeSlot: 'bad',
      pendingBadOid: null,
      pendingGoodOid: null,
    })
    useStashDialogStore.getState().closeDialog()
    useRepoUIStore.setState({ aiPanelTarget: null, activeDiffFile: null, activePrNumber: null })
  })

  it('renders the Tools trigger', () => {
    render(<ToolsMenu repoPath="/repo" />)
    expect(screen.getByTestId('toolbar-tools-button')).toHaveTextContent('Tools')
  })

  it('opens the menu with a Patch submenu and a Bisect entry', async () => {
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    expect(screen.getByTestId('tools-menu-patch')).toBeInTheDocument()
    expect(screen.getByTestId('tools-menu-bisect')).toHaveTextContent('Start bisect…')
  })

  it('begins the graph-driven bisect setup directly on a clean worktree', async () => {
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    await user.click(screen.getByTestId('tools-menu-bisect'))
    expect(useBisectUIStore.getState().setupActive).toBe(true)
    expect(useBisectUIStore.getState().activeSlot).toBe('bad')
    expect(useStashDialogStore.getState().isOpen).toBe(false)
  })

  it('opens the stash dialog first when the worktree is dirty', async () => {
    status = dirtyStatus
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    await user.click(screen.getByTestId('tools-menu-bisect'))
    // Setup does not begin until the changes are stashed via the dialog.
    expect(useStashDialogStore.getState().isOpen).toBe(true)
    expect(useStashDialogStore.getState().reason).toBe('bisect')
    expect(useBisectUIStore.getState().setupActive).toBe(false)
  })

  it('disables the Bisect entry while a session is already running', async () => {
    bisect = idleState({ active: true })
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    expect(screen.getByTestId('tools-menu-bisect')).toHaveTextContent('Bisect already running')
  })

  it('opens the package health workspace, releasing the slots another view holds', async () => {
    useRepoUIStore.setState({ activeDiffFile: { path: 'a.txt', staged: false }, activePrNumber: 7 })
    usePatchWorkspaceStore.getState().open('create')
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)

    await user.click(screen.getByTestId('toolbar-tools-button'))
    await user.click(screen.getByTestId('tools-menu-health'))

    expect(usePackageHealthStore.getState().open).toBe(true)
    // The center and right slots can only host one tool, so the others stand down.
    expect(usePatchWorkspaceStore.getState().mode).toBeNull()
    expect(useRepoUIStore.getState().activeDiffFile).toBeNull()
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  /** A repo with no package.json has nothing to check, so the entry stays inert. */
  it('disables the health entry outside a JavaScript repo', async () => {
    hasManifest = false
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)

    await user.click(screen.getByTestId('toolbar-tools-button'))
    await user.click(screen.getByTestId('tools-menu-health'))

    expect(screen.getByTestId('tools-menu-health')).toHaveAttribute('aria-disabled', 'true')
    expect(usePackageHealthStore.getState().open).toBe(false)
  })

  /** Tools is for deterministic operations; anything that spends a model run lives in `AiMenu`. */
  it('carries no LLM entry', async () => {
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    expect(screen.queryByTestId('tools-menu-summaries')).not.toBeInTheDocument()
  })
})
