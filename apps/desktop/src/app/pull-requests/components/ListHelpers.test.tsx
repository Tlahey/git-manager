import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR, SortDir } from '../types'
import {
  TableHeader,
  GroupHeader,
  LoadMore,
  InfiniteScrollSentinel,
  usePRSort,
  useSetFilter,
} from './ListHelpers'

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
