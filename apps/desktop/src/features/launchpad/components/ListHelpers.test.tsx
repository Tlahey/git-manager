import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR, MockIssue } from '../../../lib/github/types'
import type { SortDir } from '../lib/launchpadTypes'

// `IssueRow` is rendered below to check the header lines up with it; its actions hook reaches for
// a repo on disk, which a column-geometry test has no business waking up.
vi.mock('../../../hooks/useIssueActions', () => ({
  useIssueActions: () => ({
    repoPath: null,
    branch: null,
    viewRepo: vi.fn(),
    createBranch: vi.fn(),
    creatingBranch: false,
    close: vi.fn(),
    closing: false,
    canClose: false,
  }),
}))

import {
  TableHeader,
  IssueTableHeader,
  GroupHeader,
  LoadMore,
  InfiniteScrollSentinel,
} from './ListHelpers'
import { PRRow } from './PRRow'
import { IssueRow } from './IssueRow'
import { usePRSort, useSetFilter } from '../hooks/listHooks'

function samplePr(): MockPR {
  return {
    id: '1',
    number: 42,
    title: 'Add feature X',
    repo: 'git-manager',
    repoUrl: 'https://github.com/owner/git-manager',
    url: 'https://github.com/owner/git-manager/pull/42',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
  }
}

function sampleIssue(): MockIssue {
  return {
    id: '1',
    number: 42,
    title: 'Fix the thing',
    repo: 'git-manager',
    url: 'https://github.com/owner/git-manager/issues/42',
    status: 'open',
    author: 'octocat',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
  }
}

function lastObserver() {
  return (
    globalThis.IntersectionObserver as unknown as {
      instances: { trigger: () => void }[]
    }
  ).instances.at(-1)
}

describe('TableHeader', () => {
  it('renders every column label', () => {
    render(<TableHeader />)
    for (const label of ['Item', 'Updated', 'Status', 'Author', 'With', 'Repo']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('IssueTableHeader', () => {
  it('names the assignee column, where the PR header names collaborators', () => {
    render(<IssueTableHeader />)
    for (const label of ['Item', 'Updated', 'Status', 'Author', 'Assigned', 'Repo']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('With')).not.toBeInTheDocument()
  })
})

/**
 * A header and its rows live in different files and have to agree on eight column widths in one
 * order. Nothing but this test makes them: a header listing the right columns in the wrong order
 * still renders perfectly, just over the wrong data — which is exactly what the issue header did
 * in the custom-views pane until it was reconciled with `IssuesTab`'s.
 *
 * Compared as the *sequence of width classes*, since that is what decides where a column lands.
 * `min-w-[52px]` on a row against `w-[52px]` on the header is the one sanctioned difference: the
 * cell may grow past the header for a long relative date, as it always could.
 */
describe('header/row column alignment', () => {
  /** The width class of each direct child of a header or row, in document order. */
  function columnWidths(container: HTMLElement): string[] {
    const strip = container.firstElementChild
    if (!strip) throw new Error('nothing rendered')
    return [...strip.children].map((cell) => {
      const classes = [...cell.classList]
      // The elastic column is `min-w-0 flex-1` on both sides; report it as the former so the
      // failure diff names a column rather than a stray `w-0`.
      if (classes.includes('flex-1')) return 'flex-1'
      const width = classes.find((c) => c.startsWith('w-') || c.startsWith('min-w-'))
      if (!width) throw new Error(`no width class on ${cell.className}`)
      return width.replace(/^min-w-/, 'w-')
    })
  }

  it('lines the PR header up with a PR row', () => {
    const { container: header } = render(<TableHeader />)
    const { container: row } = render(
      <PRRow pr={samplePr()} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(columnWidths(header)).toEqual(columnWidths(row))
  })

  it('lines the issue header up with an issue row', () => {
    const { container: header } = render(<IssueTableHeader />)
    const { container: row } = render(
      <IssueRow issue={sampleIssue()} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(columnWidths(header)).toEqual(columnWidths(row))
  })

  /** Both lists show the same eight columns; only the labels and the status alignment differ. */
  it('gives the two lists the same geometry', () => {
    const { container: prHeader } = render(<TableHeader />)
    const { container: issueHeader } = render(<IssueTableHeader />)
    expect(columnWidths(prHeader)).toEqual(columnWidths(issueHeader))
  })
})

describe('GroupHeader', () => {
  it('shows the label, count, and toggles the chevron/onToggle', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <GroupHeader label="Needs Review" count={3} open={false} onToggle={onToggle} />
    )
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    const button = screen.getByRole('button')
    expect(button.querySelector('.lucide-chevron-right')).toBeTruthy()

    await user.click(button)
    expect(onToggle).toHaveBeenCalledOnce()

    rerender(<GroupHeader label="Needs Review" count={3} open onToggle={onToggle} />)
    expect(button.querySelector('.lucide-chevron-down')).toBeTruthy()
  })

  it('renders the section icon, a count tag, and a foreground label', () => {
    render(
      <GroupHeader
        label="Urgent"
        count={1}
        open={false}
        onToggle={vi.fn()}
        icon={<span data-testid="group-icon" />}
        iconClassName="text-amber-400"
        tone="warning"
      />
    )
    expect(screen.getByTestId('group-icon')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    // The label itself stays foreground/black (only the icon carries the section colour).
    expect(screen.getByText('Urgent')).toHaveClass('text-foreground')
  })
})

describe('LoadMore', () => {
  it('renders nothing once everything is shown', () => {
    const { container } = render(<LoadMore total={10} shown={10} onLoadMore={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the remaining count and calls onLoadMore', async () => {
    const onLoadMore = vi.fn()
    const user = userEvent.setup()
    render(<LoadMore total={25} shown={10} onLoadMore={onLoadMore} />)
    expect(screen.getByText('Load more (15 remaining)')).toBeInTheDocument()
    await user.click(screen.getByText('Load more (15 remaining)'))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })
})

describe('InfiniteScrollSentinel', () => {
  it('renders nothing when there is no more to load', () => {
    const { container } = render(
      <InfiniteScrollSentinel hasMore={false} onLoadMore={vi.fn()} loadedCount={10} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('calls onLoadMore when the sentinel scrolls into view', () => {
    const onLoadMore = vi.fn()
    render(<InfiniteScrollSentinel hasMore onLoadMore={onLoadMore} loadedCount={10} />)
    expect(screen.getByTestId('infinite-scroll-sentinel')).toBeInTheDocument()

    act(() => lastObserver()?.trigger())
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('does not fire while the sentinel stays out of view', () => {
    const onLoadMore = vi.fn()
    render(<InfiniteScrollSentinel hasMore onLoadMore={onLoadMore} loadedCount={10} />)
    act(() =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: { trigger: (v: boolean) => void }[]
        }
      ).instances
        .at(-1)
        ?.trigger(false)
    )
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: '1',
    number: 1,
    title: 't',
    repo: 'b-repo',
    repoUrl: '',
    url: '',
    status: 'open',
    ciStatus: 'success',
    author: 'bob',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 3,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date('2024-01-01'),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

describe('usePRSort', () => {
  it('sorts ascending and descending by date', () => {
    const older = pr({ id: 'a', updatedAt: new Date('2024-01-01') })
    const newer = pr({ id: 'b', updatedAt: new Date('2024-06-01') })
    const { result, rerender } = renderHook(({ dir }) => usePRSort([older, newer], 'date', dir), {
      initialProps: { dir: 'asc' as SortDir },
    })
    expect(result.current.map((p) => p.id)).toEqual(['a', 'b'])

    rerender({ dir: 'desc' })
    expect(result.current.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('sorts by author name', () => {
    const a = pr({ id: 'a', author: 'zoe' })
    const b = pr({ id: 'b', author: 'alice' })
    const { result } = renderHook(() => usePRSort([a, b], 'author', 'asc'))
    expect(result.current.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('sorts by files changed', () => {
    const a = pr({ id: 'a', filesChanged: 10 })
    const b = pr({ id: 'b', filesChanged: 2 })
    const { result } = renderHook(() => usePRSort([a, b], 'files', 'asc'))
    expect(result.current.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the original array', () => {
    const list = [
      pr({ id: 'a', updatedAt: new Date('2024-06-01') }),
      pr({ id: 'b', updatedAt: new Date('2024-01-01') }),
    ]
    renderHook(() => usePRSort(list, 'date', 'asc'))
    expect(list.map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('useSetFilter', () => {
  it('toggles values in and out of the set, and clears it', () => {
    const { result } = renderHook(() => useSetFilter())
    expect(result.current[0].size).toBe(0)

    act(() => result.current[1]('open'))
    expect(result.current[0].has('open')).toBe(true)

    act(() => result.current[1]('open'))
    expect(result.current[0].has('open')).toBe(false)

    act(() => result.current[1]('open'))
    act(() => result.current[1]('closed'))
    act(() => result.current[2]())
    expect(result.current[0].size).toBe(0)
  })
})
