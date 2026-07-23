import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BisectState, GitStatus } from '@git-manager/git-types'

let bisect: BisectState | undefined
let status: GitStatus
vi.mock('../../hooks/useBisectState', () => ({
  useBisectState: () => ({ data: bisect }),
}))
vi.mock('../../hooks/useGitStatus', () => ({
  useGitStatus: () => ({ data: status }),
}))

import { ToolsMenu } from './ToolsMenu'
import { useBisectUIStore } from '../../stores/bisectUI.store'

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
    useBisectUIStore.setState({
      setupActive: false,
      activeSlot: 'bad',
      pendingBadOid: null,
      pendingGoodOid: null,
      stashDialogOpen: false,
    })
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
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(false)
  })

  it('opens the stash dialog first when the worktree is dirty', async () => {
    status = dirtyStatus
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    await user.click(screen.getByTestId('tools-menu-bisect'))
    // Setup does not begin until the changes are stashed via the dialog.
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(true)
    expect(useBisectUIStore.getState().setupActive).toBe(false)
  })

  it('disables the Bisect entry while a session is already running', async () => {
    bisect = idleState({ active: true })
    const user = userEvent.setup()
    render(<ToolsMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-tools-button'))
    expect(screen.getByTestId('tools-menu-bisect')).toHaveTextContent('Bisect already running')
  })
})
