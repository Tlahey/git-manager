import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch } from '@git-manager/git-types'

const { useBranches } = vi.hoisted(() => ({ useBranches: vi.fn() }))
vi.mock('../../hooks/useBranches', () => ({ useBranches }))

const { lastBranchItemCalls, lastBranchFolderCalls } = vi.hoisted(() => ({
  lastBranchItemCalls: { current: [] as Record<string, unknown>[] },
  lastBranchFolderCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('./BranchItem', () => ({
  BranchItem: (props: { branch: GitBranch; isPinned: boolean }) => {
    lastBranchItemCalls.current.push(props)
    return <div data-testid={`branch-item-${props.branch.shortName}`}>{props.branch.shortName}</div>
  },
}))
vi.mock('./BranchFolder', () => ({
  BranchFolder: (props: { prefix: string; branches: GitBranch[] }) => {
    lastBranchFolderCalls.current.push(props)
    return <div data-testid={`branch-folder-${props.prefix}`}>{props.prefix}</div>
  },
}))

import { LocalBranchesSection } from './LocalBranchesSection'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'

const INITIAL_PINNED = usePinnedBranchesStore.getState()

function branch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: '',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderSection(props: Partial<React.ComponentProps<typeof LocalBranchesSection>> = {}) {
  return render(
    <LocalBranchesSection
      repoPath="/repo"
      selectedBranch={null}
      onSelectBranch={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  lastBranchItemCalls.current = []
  lastBranchFolderCalls.current = []
  usePinnedBranchesStore.setState(INITIAL_PINNED, true)
  useBranches.mockReturnValue({ data: [] })
})

describe('LocalBranchesSection — filtering (local only)', () => {
  it('excludes remote branches from the count and list', () => {
    useBranches.mockReturnValue({
      data: [branch('main'), { ...branch('origin/main'), isRemote: true }],
    })
    renderSection()
    expect(screen.getByText('Local')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('filters branches by name (case-insensitive)', () => {
    useBranches.mockReturnValue({ data: [branch('main'), branch('Feature-X')] })
    renderSection({ filter: 'feat' })
    expect(screen.getByTestId('branch-item-Feature-X')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-item-main')).not.toBeInTheDocument()
  })
})

describe('LocalBranchesSection — pinning', () => {
  it('pins main/master by default, at the top, ahead of other unprefixed branches', () => {
    useBranches.mockReturnValue({ data: [branch('zeta'), branch('main')] })
    renderSection()
    const mainCall = lastBranchItemCalls.current.find(
      (c) => (c.branch as GitBranch).shortName === 'main'
    )
    expect(mainCall).toMatchObject({ isPinned: true })
  })

  it('respects an explicit unpin override for main', () => {
    usePinnedBranchesStore.setState({ overrides: { '/repo': { main: false } } })
    useBranches.mockReturnValue({ data: [branch('main')] })
    renderSection()
    const mainCall = lastBranchItemCalls.current.find(
      (c) => (c.branch as GitBranch).shortName === 'main'
    )
    expect(mainCall).toMatchObject({ isPinned: false })
  })

  it('pins a non-default branch via an explicit override', () => {
    usePinnedBranchesStore.setState({ overrides: { '/repo': { feature: true } } })
    useBranches.mockReturnValue({ data: [branch('feature')] })
    renderSection()
    const call = lastBranchItemCalls.current.find(
      (c) => (c.branch as GitBranch).shortName === 'feature'
    )
    expect(call).toMatchObject({ isPinned: true })
  })

  it('toggles pin through the store when onTogglePin is invoked', () => {
    useBranches.mockReturnValue({ data: [branch('feature')] })
    renderSection()
    const call = lastBranchItemCalls.current.find(
      (c) => (c.branch as GitBranch).shortName === 'feature'
    )!
    ;(call.onTogglePin as (name: string) => void)('feature')
    expect(usePinnedBranchesStore.getState().overrides['/repo']?.feature).toBe(true)
  })
})

describe('LocalBranchesSection — grouping', () => {
  it('groups branches sharing a prefix into a BranchFolder, leaving unprefixed ones ungrouped', () => {
    useBranches.mockReturnValue({
      data: [branch('feature/a'), branch('feature/b'), branch('standalone')],
    })
    renderSection()
    expect(screen.getByTestId('branch-folder-feature/')).toBeInTheDocument()
    expect(screen.getByTestId('branch-item-standalone')).toBeInTheDocument()
    expect(lastBranchFolderCalls.current[0].branches).toHaveLength(2)
  })
})

describe('LocalBranchesSection — create branch action', () => {
  it('shows the create-branch button only when onCreateBranch is given', async () => {
    const onCreateBranch = vi.fn()
    const user = userEvent.setup()
    const { rerender } = renderSection()
    expect(screen.queryByLabelText('Créer une branche')).not.toBeInTheDocument()

    rerender(
      <LocalBranchesSection
        repoPath="/repo"
        selectedBranch={null}
        onSelectBranch={vi.fn()}
        onCreateBranch={onCreateBranch}
      />
    )
    await user.click(screen.getByLabelText('Créer une branche'))
    expect(onCreateBranch).toHaveBeenCalledOnce()
  })
})

describe('LocalBranchesSection — collapse', () => {
  it('collapses and re-expands the section', async () => {
    useBranches.mockReturnValue({ data: [branch('main')] })
    const user = userEvent.setup()
    renderSection()
    expect(screen.getByTestId('branch-item-main')).toBeInTheDocument()

    await user.click(screen.getByText('Local'))
    expect(screen.queryByTestId('branch-item-main')).not.toBeInTheDocument()
  })
})
