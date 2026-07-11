import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  i18next: { changeLanguage: vi.fn() },
}))

const { useBranches } = vi.hoisted(() => ({ useBranches: vi.fn() }))
vi.mock('../../hooks/useBranches', () => ({ useBranches }))

import { RepoBranchSidebar } from './RepoBranchSidebar'

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'main',
    shortName: 'main',
    isHead: false,
    isRemote: false,
    commitOid: 'abc123',
    commitMessage: 'A commit',
    commitTimestamp: Date.now() / 1000,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderSidebar(props: Partial<React.ComponentProps<typeof RepoBranchSidebar>> = {}) {
  return render(
    <RepoBranchSidebar repoPath="/repo" selectedBranch={null} onSelectBranch={vi.fn()} {...props} />
  )
}

describe('RepoBranchSidebar — header', () => {
  it('shows the HEAD branch name when present', () => {
    useBranches.mockReturnValue({ data: [branch({ name: 'main', shortName: 'main', isHead: true })] })
    renderSidebar()
    expect(screen.getByText('branch.title')).toBeInTheDocument()
    // "main" appears both in the header's HEAD indicator and in the Local branches list row.
    expect(screen.getAllByText('main')).toHaveLength(2)
  })

  it('shows no HEAD indicator when no branch is HEAD', () => {
    useBranches.mockReturnValue({ data: [branch({ isHead: false })] })
    const { container } = renderSidebar()
    expect(container.querySelector('.text-emerald-400')).toBeFalsy()
  })
})

describe('RepoBranchSidebar — All branches row', () => {
  it('highlights "All branches" when selectedBranch is null', () => {
    useBranches.mockReturnValue({ data: [] })
    renderSidebar({ selectedBranch: null })
    expect(screen.getByText('All branches').closest('button')!.className).toContain('bg-accent')
  })

  it('calls onSelectBranch(null) when clicked', async () => {
    const onSelectBranch = vi.fn()
    const user = userEvent.setup()
    useBranches.mockReturnValue({ data: [] })
    renderSidebar({ onSelectBranch })
    await user.click(screen.getByText('All branches'))
    expect(onSelectBranch).toHaveBeenCalledWith(null)
  })
})

describe('RepoBranchSidebar — Local section', () => {
  it('hides the Local section when there are no local branches', () => {
    useBranches.mockReturnValue({ data: [branch({ name: 'refs/remotes/origin/main', isRemote: true })] })
    renderSidebar()
    expect(screen.queryByText('Local')).not.toBeInTheDocument()
  })

  it('lists local branches with their count', () => {
    useBranches.mockReturnValue({
      data: [branch({ name: 'main', shortName: 'main' }), branch({ name: 'dev', shortName: 'dev' })],
    })
    renderSidebar()
    expect(screen.getByText('Local')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
  })

  it('shows the ahead/behind counts when present', () => {
    useBranches.mockReturnValue({
      data: [branch({ name: 'feature', shortName: 'feature', aheadCount: 2, behindCount: 1 })],
    })
    renderSidebar()
    expect(screen.getByText('↑2')).toBeInTheDocument()
    expect(screen.getByText('↓1')).toBeInTheDocument()
  })

  it('collapses and expands the section on header click', async () => {
    const user = userEvent.setup()
    useBranches.mockReturnValue({ data: [branch({ name: 'main', shortName: 'main' })] })
    renderSidebar()
    expect(screen.getByText('main')).toBeInTheDocument()
    await user.click(screen.getByText('Local'))
    expect(screen.queryByText('main')).not.toBeInTheDocument()
    await user.click(screen.getByText('Local'))
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('selects a branch and toggles it off when clicked again', async () => {
    const onSelectBranch = vi.fn()
    const user = userEvent.setup()
    useBranches.mockReturnValue({ data: [branch({ name: 'main', shortName: 'main' })] })
    const { rerender } = renderSidebar({ selectedBranch: null, onSelectBranch })
    await user.click(screen.getByText('main'))
    expect(onSelectBranch).toHaveBeenCalledWith('main')

    rerender(
      <RepoBranchSidebar repoPath="/repo" selectedBranch="main" onSelectBranch={onSelectBranch} />
    )
    await user.click(screen.getByText('main'))
    expect(onSelectBranch).toHaveBeenCalledWith(null)
  })
})

describe('RepoBranchSidebar — remote grouping', () => {
  it('groups remote branches by remote name under "Remote · <name>"', () => {
    useBranches.mockReturnValue({
      data: [
        branch({ name: 'refs/remotes/origin/main', shortName: 'origin/main', isRemote: true }),
        branch({ name: 'refs/remotes/upstream/main', shortName: 'upstream/main', isRemote: true }),
      ],
    })
    renderSidebar()
    expect(screen.getByText('Remote · origin')).toBeInTheDocument()
    expect(screen.getByText('Remote · upstream')).toBeInTheDocument()
  })

  it('falls back to name[0] for a 2-segment remote branch name', () => {
    useBranches.mockReturnValue({
      data: [branch({ name: 'origin/main', shortName: 'origin/main', isRemote: true })],
    })
    renderSidebar()
    expect(screen.getByText('Remote · origin')).toBeInTheDocument()
  })
})

describe('RepoBranchSidebar — footer', () => {
  it('shows the tags hint', () => {
    useBranches.mockReturnValue({ data: [] })
    renderSidebar()
    expect(screen.getByText('Tags visible in graph')).toBeInTheDocument()
  })
})
