import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toolbar } from './Toolbar'
import type { SortKey, SortDir } from '../types'

function renderToolbar(props: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  return render(
    <Toolbar
      search=""
      onSearch={vi.fn()}
      sortKey={'date' as SortKey}
      sortDir={'desc' as SortDir}
      onSort={vi.fn()}
      statusFilter={new Set()}
      onToggleStatus={vi.fn()}
      onClearStatus={vi.fn()}
      repoFilter={new Set()}
      onToggleRepo={vi.fn()}
      onClearRepo={vi.fn()}
      authorFilter={new Set()}
      onToggleAuthor={vi.fn()}
      onClearAuthor={vi.fn()}
      repos={['repo-a', 'repo-b']}
      statuses={['open', 'closed']}
      authors={['alice', 'bob']}
      {...props}
    />
  )
}

// "Status", "Author" and "Repo" each appear twice: once as a filter-dropdown trigger label and
// once as a sort-button label. The sort buttons all live together in the last
// `.flex.items-center.gap-1` container (the clear-all badge shares those classes but only renders
// when a filter is active, so it never collides in the default no-filter render used below).
function sortButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.flex.items-center.gap-1 > button'))
}

describe('Toolbar — search', () => {
  it('calls onSearch as the user types', async () => {
    const onSearch = vi.fn()
    const user = userEvent.setup()
    renderToolbar({ onSearch })
    await user.type(screen.getByPlaceholderText('Search…'), 'x')
    expect(onSearch).toHaveBeenCalledWith('x')
  })

  it('hides the clear button when search is empty', () => {
    const { container } = renderToolbar({ search: '' })
    expect(container.querySelector('.absolute.right-2')).not.toBeInTheDocument()
  })

  it('clears the search via the X button', async () => {
    const onSearch = vi.fn()
    const user = userEvent.setup()
    const { container } = renderToolbar({ search: 'foo', onSearch })
    const clearButton = container.querySelector('.absolute.right-2')!
    await user.click(clearButton)
    expect(onSearch).toHaveBeenCalledWith('')
  })
})

describe('Toolbar — filter dropdowns', () => {
  it('renders Repo, Status and Author dropdown triggers', () => {
    renderToolbar()
    // Each label also appears as a sort-button, so there are 2 matches per label.
    expect(screen.getAllByText('Repo')).toHaveLength(2)
    expect(screen.getAllByText('Status')).toHaveLength(2)
    expect(screen.getAllByText('Author')).toHaveLength(2)
  })
})

describe('Toolbar — clear all badge', () => {
  it('hides the clear-all badge when no filters are active', () => {
    renderToolbar()
    expect(screen.queryByText(/Clear all/)).not.toBeInTheDocument()
  })

  it('shows the total active filter count and clears every filter on click', async () => {
    const onClearStatus = vi.fn()
    const onClearRepo = vi.fn()
    const onClearAuthor = vi.fn()
    const user = userEvent.setup()
    renderToolbar({
      statusFilter: new Set(['open']),
      repoFilter: new Set(['repo-a', 'repo-b']),
      authorFilter: new Set(),
      onClearStatus,
      onClearRepo,
      onClearAuthor,
    })
    expect(screen.getByText('Clear all (3)')).toBeInTheDocument()
    await user.click(screen.getByText('Clear all (3)'))
    expect(onClearStatus).toHaveBeenCalledOnce()
    expect(onClearRepo).toHaveBeenCalledOnce()
    expect(onClearAuthor).toHaveBeenCalledOnce()
  })
})

describe('Toolbar — sort buttons', () => {
  it('renders all 5 sort keys in order and calls onSort with the clicked key', async () => {
    const onSort = vi.fn()
    const user = userEvent.setup()
    const { container } = renderToolbar({ onSort })
    const buttons = sortButtons(container)
    expect(buttons.map((b) => b.textContent)).toEqual(['Date', 'Status', 'Author', 'Repo', 'Files'])
    await user.click(buttons[2])
    expect(onSort).toHaveBeenCalledWith('author')
  })

  it('shows the sort direction arrow only on the active sort key (ArrowDown for desc)', () => {
    const { container } = renderToolbar({ sortKey: 'author', sortDir: 'desc' })
    const buttons = sortButtons(container)
    const [dateBtn, statusBtn, authorBtn, repoBtn, filesBtn] = buttons
    expect(dateBtn.querySelector('svg')).toBeNull()
    expect(statusBtn.querySelector('svg')).toBeNull()
    expect(repoBtn.querySelector('svg')).toBeNull()
    expect(filesBtn.querySelector('svg')).toBeNull()
    const arrow = authorBtn.querySelector('svg')
    expect(arrow).toBeTruthy()
    expect(arrow).toHaveClass('lucide-arrow-down')
  })

  it('renders ArrowUp for ascending sort', () => {
    const { container } = renderToolbar({ sortKey: 'repo', sortDir: 'asc' })
    const repoBtn = sortButtons(container)[3]
    const arrow = repoBtn.querySelector('svg')
    expect(arrow).toBeTruthy()
    expect(arrow).toHaveClass('lucide-arrow-up')
  })
})

describe('Toolbar — children', () => {
  it('renders children on the right side when provided', () => {
    renderToolbar({ children: <button>Extra</button> })
    expect(screen.getByText('Extra')).toBeInTheDocument()
  })

  it('renders nothing extra when no children are provided', () => {
    renderToolbar()
    expect(screen.queryByText('Extra')).not.toBeInTheDocument()
  })
})
