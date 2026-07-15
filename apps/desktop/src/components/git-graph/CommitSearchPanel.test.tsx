import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { CommitSearchPanel } from './CommitSearchPanel'
import { useCommitSearchStore } from '../../stores/commitSearch.store'

beforeEach(() => {
  useCommitSearchStore.setState({ open: false, query: '' })
})

function renderPanel(props: Partial<React.ComponentProps<typeof CommitSearchPanel>> = {}) {
  return render(
    <CommitSearchPanel
      resultCount={0}
      activeIndex={0}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      {...props}
    />
  )
}

describe('CommitSearchPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel()
    expect(screen.queryByTestId('commit-search-panel')).not.toBeInTheDocument()
  })

  it('renders the input focused and reflects the store query when open', () => {
    useCommitSearchStore.setState({ open: true, query: 'feat' })
    renderPanel()
    const input = screen.getByTestId('commit-search-input') as HTMLInputElement
    expect(input.value).toBe('feat')
    expect(input).toHaveFocus()
  })

  it('updates the store query as the user types', async () => {
    useCommitSearchStore.setState({ open: true })
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByTestId('commit-search-input'), 'x')
    expect(useCommitSearchStore.getState().query).toBe('x')
  })

  it('closes and clears the query when the close button is clicked', async () => {
    useCommitSearchStore.setState({ open: true, query: 'feat' })
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('commit-search-close'))
    expect(useCommitSearchStore.getState().open).toBe(false)
    expect(useCommitSearchStore.getState().query).toBe('')
  })

  it('closes on Escape from within the input', async () => {
    useCommitSearchStore.setState({ open: true, query: 'feat' })
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByTestId('commit-search-input'), '{Escape}')
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('hides the result count and disables prev/next when the query is empty', () => {
    useCommitSearchStore.setState({ open: true, query: '' })
    renderPanel({ resultCount: 0 })
    expect(screen.queryByTestId('commit-search-count')).not.toBeInTheDocument()
    expect(screen.getByTestId('commit-search-prev')).toBeDisabled()
    expect(screen.getByTestId('commit-search-next')).toBeDisabled()
  })

  it('shows "0/0" and disables prev/next when the query matches nothing', () => {
    useCommitSearchStore.setState({ open: true, query: 'nomatch' })
    renderPanel({ resultCount: 0 })
    expect(screen.getByTestId('commit-search-count')).toHaveTextContent('0/0')
    expect(screen.getByTestId('commit-search-prev')).toBeDisabled()
    expect(screen.getByTestId('commit-search-next')).toBeDisabled()
  })

  it('shows a 1-based "current/total" count and enables prev/next when there are matches', () => {
    useCommitSearchStore.setState({ open: true, query: 'fix' })
    renderPanel({ resultCount: 5, activeIndex: 2 })
    expect(screen.getByTestId('commit-search-count')).toHaveTextContent('3/5')
    expect(screen.getByTestId('commit-search-prev')).toBeEnabled()
    expect(screen.getByTestId('commit-search-next')).toBeEnabled()
  })

  it('calls onNext/onPrevious from the chevron buttons', async () => {
    useCommitSearchStore.setState({ open: true, query: 'fix' })
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    const user = userEvent.setup()
    renderPanel({ resultCount: 3, activeIndex: 0, onNext, onPrevious })
    await user.click(screen.getByTestId('commit-search-next'))
    expect(onNext).toHaveBeenCalledOnce()
    await user.click(screen.getByTestId('commit-search-prev'))
    expect(onPrevious).toHaveBeenCalledOnce()
  })

  it('calls onNext on Enter and onPrevious on Shift+Enter from the input', async () => {
    useCommitSearchStore.setState({ open: true, query: 'fix' })
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    const user = userEvent.setup()
    renderPanel({ resultCount: 3, activeIndex: 0, onNext, onPrevious })
    const input = screen.getByTestId('commit-search-input')
    await user.type(input, '{Enter}')
    expect(onNext).toHaveBeenCalledOnce()
    await user.type(input, '{Shift>}{Enter}{/Shift}')
    expect(onPrevious).toHaveBeenCalledOnce()
  })
})
