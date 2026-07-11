import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch } from '@git-manager/git-types'
import { BranchFolder } from './BranchFolder'

const { lastBranchItemCalls } = vi.hoisted(() => ({ lastBranchItemCalls: { current: [] as Record<string, unknown>[] } }))
vi.mock('./BranchItem', () => ({
  BranchItem: (props: { branch: GitBranch }) => {
    lastBranchItemCalls.current.push(props)
    return <div data-testid={`branch-item-${props.branch.shortName}`} />
  },
}))

function branch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'abc',
    commitMessage: 'm',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  lastBranchItemCalls.current = []
})

describe('BranchFolder — header', () => {
  it('shows the prefix and branch count', () => {
    render(<BranchFolder prefix="feature" branches={[branch('feature/a'), branch('feature/b')]} selectedBranch={null} onSelect={vi.fn()} />)
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows a HEAD dot when one of its branches is the current branch', () => {
    render(<BranchFolder prefix="feature" branches={[branch('feature/a', { isHead: true })]} selectedBranch={null} onSelect={vi.fn()} />)
    expect(screen.getByText('●')).toBeInTheDocument()
  })

  it('hides the HEAD dot when none of its branches are current', () => {
    render(<BranchFolder prefix="feature" branches={[branch('feature/a')]} selectedBranch={null} onSelect={vi.fn()} />)
    expect(screen.queryByText('●')).not.toBeInTheDocument()
  })
})

describe('BranchFolder — expand/collapse', () => {
  it('starts expanded, showing every branch item', () => {
    render(<BranchFolder prefix="feature" branches={[branch('feature/a')]} selectedBranch={null} onSelect={vi.fn()} />)
    expect(screen.getByTestId('branch-item-feature/a')).toBeInTheDocument()
  })

  it('collapses and re-expands on click', async () => {
    const user = userEvent.setup()
    render(<BranchFolder prefix="feature" branches={[branch('feature/a')]} selectedBranch={null} onSelect={vi.fn()} />)
    await user.click(screen.getByText('feature'))
    expect(screen.queryByTestId('branch-item-feature/a')).not.toBeInTheDocument()

    await user.click(screen.getByText('feature'))
    expect(screen.getByTestId('branch-item-feature/a')).toBeInTheDocument()
  })
})

describe('BranchFolder — forwarded props', () => {
  it('marks the item selected by shortName or full name, at depth 1', () => {
    render(<BranchFolder prefix="feature" branches={[branch('feature/a')]} selectedBranch="feature/a" onSelect={vi.fn()} />)
    expect(lastBranchItemCalls.current[0]).toMatchObject({ isSelected: true, depth: 1 })
  })

  it('marks pinned state from pinnedNames', () => {
    render(
      <BranchFolder
        prefix="feature"
        branches={[branch('feature/a')]}
        selectedBranch={null}
        pinnedNames={new Set(['feature/a'])}
        onSelect={vi.fn()}
      />
    )
    expect(lastBranchItemCalls.current[0]).toMatchObject({ isPinned: true })
  })

  it('defaults isPinned to false without pinnedNames', () => {
    render(<BranchFolder prefix="feature" branches={[branch('feature/a')]} selectedBranch={null} onSelect={vi.fn()} />)
    expect(lastBranchItemCalls.current[0]).toMatchObject({ isPinned: false })
  })
})
