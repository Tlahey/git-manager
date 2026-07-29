import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SavedFilterDialog } from './SavedFilterDialog'
import { DEFAULT_ISSUE_FILTERS, useIssueFiltersStore } from '../../stores/issueFilters.store'

beforeEach(() => {
  useIssueFiltersStore.setState({ filters: DEFAULT_ISSUE_FILTERS })
})

const nameInput = () => screen.getByTestId('saved-filter-name-input')
const queryInput = () => screen.getByTestId('saved-filter-query-input')
const confirm = () => screen.getByTestId('saved-filter-confirm-button')
const filters = () => useIssueFiltersStore.getState().filters

describe('SavedFilterDialog — creating', () => {
  it('opens empty, titled for a new filter', () => {
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={null} onClose={vi.fn()} />)
    expect(screen.getByText('New issue filter')).toBeInTheDocument()
    expect(nameInput()).toHaveValue('')
    expect(queryInput()).toHaveValue('')
    expect(confirm()).toHaveTextContent('Add filter')
  })

  it('refuses to submit until both a name and a query are filled in', async () => {
    const user = userEvent.setup()
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={null} onClose={vi.fn()} />)

    expect(confirm()).toBeDisabled()
    await user.type(nameInput(), 'Bugs')
    expect(confirm()).toBeDisabled()
    await user.type(queryInput(), 'label:bug')
    expect(confirm()).toBeEnabled()
  })

  it('appends the new filter and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={null} onClose={onClose} />)

    await user.type(nameInput(), 'Bugs')
    await user.type(queryInput(), 'label:bug is:open')
    await user.click(confirm())

    expect(filters().at(-1)).toMatchObject({ name: 'Bugs', query: 'label:bug is:open' })
    expect(onClose).toHaveBeenCalled()
  })

  it('submits on Enter from the query field', async () => {
    const user = userEvent.setup()
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={null} onClose={vi.fn()} />)

    await user.type(nameInput(), 'Bugs')
    await user.type(queryInput(), 'label:bug{Enter}')

    expect(filters().at(-1)).toMatchObject({ name: 'Bugs' })
  })
})

describe('SavedFilterDialog — editing', () => {
  it('seeds the fields from the filter, titled for an edit', () => {
    render(
      <SavedFilterDialog
        open
        useStore={useIssueFiltersStore}
        filter={{ id: 'f1', name: 'Bugs', query: 'label:bug' }}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Edit issue filter')).toBeInTheDocument()
    expect(nameInput()).toHaveValue('Bugs')
    expect(queryInput()).toHaveValue('label:bug')
    expect(confirm()).toHaveTextContent('Save filter')
  })

  // A built-in has no `name` of its own, so an edit has to start from the label the user sees.
  it('seeds a built-in filter from its translated label rather than an empty box', () => {
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={DEFAULT_ISSUE_FILTERS[0]} onClose={vi.fn()} />)
    expect(nameInput()).toHaveValue('All open issues')
  })

  it('updates the filter in place instead of adding one', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={DEFAULT_ISSUE_FILTERS[0]} onClose={onClose} />)

    await user.clear(queryInput())
    await user.type(queryInput(), 'is:open label:bug')
    await user.click(confirm())

    expect(filters()).toHaveLength(DEFAULT_ISSUE_FILTERS.length)
    expect(filters()[0]).toMatchObject({ id: 'builtin:all-open', query: 'is:open label:bug' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes without saving when cancelled', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SavedFilterDialog useStore={useIssueFiltersStore} open filter={DEFAULT_ISSUE_FILTERS[0]} onClose={onClose} />)

    await user.clear(queryInput())
    await user.type(queryInput(), 'is:closed')
    await user.click(screen.getByText('Cancel'))

    expect(filters()[0].query).toBe('is:open')
    expect(onClose).toHaveBeenCalled()
  })
})
