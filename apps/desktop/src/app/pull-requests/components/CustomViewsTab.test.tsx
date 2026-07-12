import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR, MockIssue } from '../types'
import type { SavedFilter } from '../../../stores/launchpad.store'

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }))

import { CustomViewsTab } from './CustomViewsTab'
import { useLaunchpadStore } from '../../../stores/launchpad.store'

const INITIAL_STATE = useLaunchpadStore.getState()

function filter(overrides: Partial<SavedFilter> = {}): SavedFilter {
  return {
    id: overrides.id ?? Math.random().toString(),
    name: 'My filter',
    emoji: '🔍',
    type: 'both',
    createdAt: Date.now(),
    ...overrides,
  }
}

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'A pull request',
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
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'An issue',
    repo: 'repo-a',
    url: 'https://x/issues/1',
    status: 'open',
    author: 'alice',
    authorAvatar: 'x',
    assignees: [],
    labels: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    comments: 0,
    ...overrides,
  }
}

function renderTab(props: Partial<React.ComponentProps<typeof CustomViewsTab>> = {}) {
  return render(
    <CustomViewsTab
      allPRs={[]}
      allIssues={[]}
      pinnedIds={new Set()}
      onTogglePin={vi.fn()}
      loading={false}
      {...props}
    />
  )
}

// The sidebar (filter list) and the content header both render the active filter's name/emoji,
// so most assertions on filter names/emoji/badges must be scoped to one side via these helpers.
function sidebar(container: HTMLElement) {
  return container.querySelector<HTMLElement>('.w-52')!
}
function sidebarRow(container: HTMLElement, name: string) {
  return within(sidebar(container)).getByText(name).closest('.group\\/filter') as HTMLElement
}

beforeEach(() => {
  useLaunchpadStore.setState(INITIAL_STATE, true)
  useLaunchpadStore.setState({ savedFilters: [] })
})

describe('CustomViewsTab — no filters', () => {
  it('shows the empty sidebar message and no-filter-selected right pane', () => {
    renderTab()
    expect(screen.getByText(/No filters yet/)).toBeInTheDocument()
    expect(screen.getByText('No filter selected')).toBeInTheDocument()
  })

  it('opens the create dialog from the empty-state "New filter" button', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(screen.getByText('New filter'))
    expect(screen.getByText('New custom filter')).toBeInTheDocument()
  })
})

describe('CustomViewsTab — filter list', () => {
  it('auto-selects the first saved filter and shows its name/emoji in the header', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', name: 'Bugs', emoji: '🐛' })] })
    const { container } = renderTab()
    // "Bugs"/"🐛" appear in both the sidebar entry and the content header — check both exist.
    expect(screen.getAllByText('Bugs')).toHaveLength(2)
    // 🐛 also shows a 3rd time in the "no results" empty state (no PRs/issues passed here).
    expect(screen.getAllByText('🐛')).toHaveLength(3)
    void container
  })

  it('shows the match count badge per filter', () => {
    useLaunchpadStore.setState({
      savedFilters: [filter({ id: 'f1', name: 'All PRs', type: 'prs' })],
    })
    const { container } = renderTab({ allPRs: [pr({ id: '1' }), pr({ id: '2' })] })
    expect(within(sidebarRow(container, 'All PRs')).getByText('2')).toBeInTheDocument()
  })

  it('switches the active filter when another one is clicked', async () => {
    const user = userEvent.setup()
    useLaunchpadStore.setState({
      savedFilters: [
        filter({ id: 'f1', name: 'First filter' }),
        filter({ id: 'f2', name: 'Second filter' }),
      ],
    })
    const { container } = renderTab()
    expect(screen.getByText('— PRs & Issues')).toBeInTheDocument()
    // Before switching, "Second filter" appears only once (sidebar); after, it also appears in the header.
    expect(screen.getAllByText('Second filter')).toHaveLength(1)
    await user.click(within(sidebar(container)).getByText('Second filter'))
    expect(screen.getAllByText('Second filter')).toHaveLength(2)
  })
})

describe('CustomViewsTab — filter criteria panel', () => {
  it('shows "No criteria" when the filter has no constraints', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1' })] })
    renderTab()
    expect(screen.getByText('No criteria (matches all)')).toBeInTheDocument()
  })

  it('lists each active criterion', () => {
    useLaunchpadStore.setState({
      savedFilters: [
        filter({
          id: 'f1',
          titleContains: 'fix',
          authorContains: 'bob',
          repo: 'repo-a',
          labelContains: 'bug',
          statuses: ['open', 'merged'],
          needsMyReview: true,
        }),
      ],
    })
    renderTab()
    expect(screen.getByText('"fix"')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('repo-a')).toBeInTheDocument()
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('open, merged')).toBeInTheDocument()
    expect(screen.getByText('Needs my review')).toBeInTheDocument()
  })
})

describe('CustomViewsTab — creating a filter', () => {
  it('adds a new filter via the sidebar + button and the editor dialog', async () => {
    const user = userEvent.setup()
    const { container } = renderTab()
    await user.click(screen.getByTitle('New filter'))
    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), 'Fresh filter')
    await user.click(screen.getByText('Create filter'))
    expect(useLaunchpadStore.getState().savedFilters.map((f) => f.name)).toContain('Fresh filter')
    expect(within(sidebar(container)).getByText('Fresh filter')).toBeInTheDocument()
  })
})

describe('CustomViewsTab — editing a filter', () => {
  it('opens the editor pre-filled and updates the filter in place', async () => {
    const user = userEvent.setup()
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', name: 'Old name' })] })
    const { container } = renderTab()
    await user.click(screen.getByTitle('Edit'))
    expect(screen.getByText('Edit filter')).toBeInTheDocument()
    const nameInput = screen.getByPlaceholderText('e.g. My bugfixes')
    await user.clear(nameInput)
    await user.type(nameInput, 'New name')
    await user.click(screen.getByText('Save changes'))
    expect(useLaunchpadStore.getState().savedFilters[0].name).toBe('New name')
    expect(within(sidebar(container)).getByText('New name')).toBeInTheDocument()
    expect(screen.queryByText('Old name')).not.toBeInTheDocument()
  })
})

describe('CustomViewsTab — deleting a filter', () => {
  it('requires a second click to confirm deletion', async () => {
    const user = userEvent.setup()
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', name: 'Doomed filter' })] })
    const { container } = renderTab()
    await user.click(within(sidebarRow(container, 'Doomed filter')).getByTitle('Delete'))
    expect(useLaunchpadStore.getState().savedFilters).toHaveLength(1)
    await user.click(screen.getByText('Confirm'))
    expect(useLaunchpadStore.getState().savedFilters).toHaveLength(0)
    expect(screen.queryByText('Doomed filter')).not.toBeInTheDocument()
  })

  it('falls back to the next filter (or none) when the active filter is deleted', async () => {
    const user = userEvent.setup()
    useLaunchpadStore.setState({
      savedFilters: [filter({ id: 'f1', name: 'First' }), filter({ id: 'f2', name: 'Second' })],
    })
    const { container } = renderTab()
    await user.click(within(sidebarRow(container, 'First')).getByTitle('Delete'))
    await user.click(within(sidebarRow(container, 'First')).getByText('Confirm'))
    expect(screen.getByText('— PRs & Issues')).toBeInTheDocument()
    expect(useLaunchpadStore.getState().savedFilters.map((f) => f.id)).toEqual(['f2'])
  })
})

describe('CustomViewsTab — results content', () => {
  it('shows both PRs and Issues section headers with counts when the filter type is "both"', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'both' })] })
    renderTab({ allPRs: [pr({ id: '1' })], allIssues: [issue({ id: '1' })] })
    expect(screen.getByText('Pull Requests')).toBeInTheDocument()
    expect(screen.getByText('Issues')).toBeInTheDocument()
    expect(screen.getByText('2 results')).toBeInTheDocument()
  })

  it('shows only PRs when the filter type is "prs"', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'prs' })] })
    renderTab({
      allPRs: [pr({ id: '1', title: 'Only PR' })],
      allIssues: [issue({ id: '1', title: 'Hidden issue' })],
    })
    expect(screen.getByText('Only PR')).toBeInTheDocument()
    expect(screen.queryByText('Hidden issue')).not.toBeInTheDocument()
    expect(screen.queryByText('Pull Requests')).not.toBeInTheDocument() // no section header outside "both"
  })

  it('shows only Issues when the filter type is "issues"', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'issues' })] })
    renderTab({
      allPRs: [pr({ id: '1', title: 'Hidden PR' })],
      allIssues: [issue({ id: '1', title: 'Only issue' })],
    })
    expect(screen.getByText('Only issue')).toBeInTheDocument()
    expect(screen.queryByText('Hidden PR')).not.toBeInTheDocument()
  })

  it('applies the filter criteria (e.g. labelContains) to matching', () => {
    useLaunchpadStore.setState({
      savedFilters: [filter({ id: 'f1', type: 'prs', labelContains: 'bug' })],
    })
    renderTab({
      allPRs: [
        pr({ id: '1', title: 'Buggy PR', labels: ['bug'] }),
        pr({ id: '2', title: 'Clean PR', labels: [] }),
      ],
    })
    expect(screen.getByText('Buggy PR')).toBeInTheDocument()
    expect(screen.queryByText('Clean PR')).not.toBeInTheDocument()
  })

  it('shows "1 result" (singular) for a single match', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'prs' })] })
    renderTab({ allPRs: [pr({ id: '1' })] })
    expect(screen.getByText('1 result')).toBeInTheDocument()
  })

  it('shows a "no results" message with the filter emoji when nothing matches', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'prs', emoji: '🎯' })] })
    renderTab({ allPRs: [] })
    expect(screen.getByText('No results match this filter')).toBeInTheDocument()
    // The emoji also appears in the sidebar entry and content header, so 3 occurrences total.
    expect(screen.getAllByText('🎯')).toHaveLength(3)
  })

  it('filters results further by the in-view search box', async () => {
    const user = userEvent.setup()
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'prs' })] })
    renderTab({
      allPRs: [pr({ id: '1', title: 'Fix the bug' }), pr({ id: '2', title: 'Add feature' })],
    })
    await user.type(screen.getByPlaceholderText('Search within this view…'), 'bug')
    expect(screen.getByText('Fix the bug')).toBeInTheDocument()
    expect(screen.queryByText('Add feature')).not.toBeInTheDocument()
  })

  it('shows skeleton rows while loading', () => {
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'both' })] })
    const { container } = renderTab({ loading: true })
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('paginates matched PRs beyond 20 results', async () => {
    const user = userEvent.setup()
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'prs' })] })
    const prs = Array.from({ length: 22 }, (_, i) => pr({ id: String(i), title: `PR number ${i}` }))
    renderTab({ allPRs: prs })
    expect(screen.getByText('Load more (2 remaining)')).toBeInTheDocument()
    await user.click(screen.getByText('Load more (2 remaining)'))
    expect(screen.getByText('PR number 21')).toBeInTheDocument()
  })
})

describe('CustomViewsTab — pin toggling in results', () => {
  it('forwards onTogglePin from a PRRow in the results', async () => {
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    useLaunchpadStore.setState({ savedFilters: [filter({ id: 'f1', type: 'prs' })] })
    renderTab({ allPRs: [pr({ id: 'pr-1' })], onTogglePin })
    await user.click(screen.getByTitle('Pin'))
    expect(onTogglePin).toHaveBeenCalledWith('pr-1')
  })
})
