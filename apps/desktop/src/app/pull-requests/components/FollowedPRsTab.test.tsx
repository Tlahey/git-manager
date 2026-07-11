import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../types'

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }))

import { FollowedPRsTab } from './FollowedPRsTab'

function makePR(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'A followed PR',
    repo: 'repo-a',
    repoUrl: 'x',
    url: 'https://x/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'alice',
    authorAvatar: 'x',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    reviewStatus: 'pending',
    isDraft: false,
    isFollowed: true,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function renderTab(props: Partial<React.ComponentProps<typeof FollowedPRsTab>> = {}) {
  return render(
    <FollowedPRsTab
      followedPRs={[]}
      pinnedIds={new Set()}
      onTogglePin={vi.fn()}
      onAddFollowed={vi.fn()}
      onRemoveFollowed={vi.fn()}
      loading={false}
      {...props}
    />
  )
}

describe('FollowedPRsTab — loading', () => {
  it('shows skeleton rows while loading', () => {
    const { container } = renderTab({ loading: true })
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('FollowedPRsTab — empty states', () => {
  it('shows the "no followed PRs" empty state when the list is empty', () => {
    renderTab({ followedPRs: [] })
    expect(screen.getByText('No followed PRs yet')).toBeInTheDocument()
  })

  it('shows a "no match" message when filters exclude everything, distinct from the empty-list state', async () => {
    const user = userEvent.setup()
    renderTab({ followedPRs: [makePR({ title: 'Something' })] })
    await user.type(screen.getByPlaceholderText('Search…'), 'nonexistent')
    expect(screen.getByText('No PRs match your search or filters.')).toBeInTheDocument()
    expect(screen.queryByText('No followed PRs yet')).not.toBeInTheDocument()
  })
})

describe('FollowedPRsTab — content', () => {
  it('lists followed PRs', () => {
    renderTab({ followedPRs: [makePR({ title: 'Followed one' })] })
    expect(screen.getByText('Followed one')).toBeInTheDocument()
  })
})

describe('FollowedPRsTab — unfollow', () => {
  it('calls onRemoveFollowed with the PR id via the unfollow button, without opening the PR', async () => {
    const onRemoveFollowed = vi.fn()
    const user = userEvent.setup()
    renderTab({ followedPRs: [makePR({ id: 'pr-1' })], onRemoveFollowed })
    await user.click(screen.getByTitle('Unfollow PR'))
    expect(onRemoveFollowed).toHaveBeenCalledWith('pr-1')
  })
})

describe('FollowedPRsTab — Follow PR dialog', () => {
  it('is closed by default', () => {
    renderTab()
    expect(screen.queryByText('Follow a Pull Request')).not.toBeInTheDocument()
  })

  it('opens via the toolbar "Follow PR" button', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(screen.getByText('Follow PR'))
    expect(screen.getByText('Follow a Pull Request')).toBeInTheDocument()
  })

  it('opens via the empty-state "Add PR by URL" button when there are no followed PRs', async () => {
    const user = userEvent.setup()
    renderTab({ followedPRs: [] })
    await user.click(screen.getByText('Add PR by URL'))
    expect(screen.getByText('Follow a Pull Request')).toBeInTheDocument()
  })

  it('parses a valid GitHub PR URL and calls onAddFollowed with a derived PR, then closes', async () => {
    const onAddFollowed = vi.fn()
    const user = userEvent.setup()
    renderTab({ onAddFollowed })
    await user.click(screen.getByText('Follow PR'))
    await user.type(screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'), 'https://github.com/owner/my-repo/pull/456')
    await user.click(screen.getByRole('button', { name: 'Follow PR' }))
    expect(onAddFollowed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'followed-https://github.com/owner/my-repo/pull/456',
        number: 456,
        repo: 'my-repo',
        title: 'PR #456 — my-repo',
        isFollowed: true,
      })
    )
    expect(screen.queryByText('Follow a Pull Request')).not.toBeInTheDocument()
  })

  it('closes without adding when Cancel is clicked', async () => {
    const onAddFollowed = vi.fn()
    const user = userEvent.setup()
    renderTab({ onAddFollowed })
    await user.click(screen.getByText('Follow PR'))
    await user.click(screen.getByText('Cancel'))
    expect(onAddFollowed).not.toHaveBeenCalled()
    expect(screen.queryByText('Follow a Pull Request')).not.toBeInTheDocument()
  })
})

describe('FollowedPRsTab — pagination', () => {
  it('shows a Load more button beyond 20 followed PRs', async () => {
    const prs = Array.from({ length: 22 }, (_, i) => makePR({ id: String(i), title: `Followed ${i}` }))
    const user = userEvent.setup()
    renderTab({ followedPRs: prs })
    expect(screen.getByText('Load more (2 remaining)')).toBeInTheDocument()
    await user.click(screen.getByText('Load more (2 remaining)'))
    expect(screen.getByText('Followed 21')).toBeInTheDocument()
  })
})
