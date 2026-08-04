import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardColumn } from '@git-manager/git-types'
import { AddIssueDialog } from './AddIssueDialog'

const { useRepoOpenIssues } = vi.hoisted(() => ({ useRepoOpenIssues: vi.fn() }))
vi.mock('../../../hooks/useRepoOpenIssues', () => ({ useRepoOpenIssues }))

const columns: BoardColumn[] = [
  { id: 'todo', name: 'Todo', order: 0 },
  { id: 'done', name: 'Done', order: 1 },
]

function issue(number: number, title: string) {
  return { number, title }
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddIssueDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <AddIssueDialog
      open
      onOpenChange={() => {}}
      repoPath="/repo"
      columns={columns}
      onSubmit={onSubmit}
      {...props}
    />
  )
  return onSubmit
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoOpenIssues.mockReturnValue({
    issues: [issue(7, 'Header overlaps'), issue(12, 'Slow startup')],
    isLoading: false,
  })
})

describe('AddIssueDialog — picking from the list', () => {
  it('lists the repo’s open issues', () => {
    renderDialog()
    expect(screen.getByTestId('add-issue-option-7')).toHaveTextContent('Header overlaps')
    expect(screen.getByTestId('add-issue-option-12')).toHaveTextContent('Slow startup')
  })

  it('needs a choice before it will submit', async () => {
    const onSubmit = renderDialog()
    expect(screen.getByTestId('add-issue-submit')).toBeDisabled()

    await userEvent.click(screen.getByTestId('add-issue-option-7'))
    expect(screen.getByTestId('add-issue-submit')).toBeEnabled()

    await userEvent.selectOptions(screen.getByTestId('add-issue-column'), 'done')
    await userEvent.click(screen.getByTestId('add-issue-submit'))
    expect(onSubmit).toHaveBeenCalledWith(7, 'done')
  })

  it('filters by title and by number', async () => {
    renderDialog()

    await userEvent.type(screen.getByTestId('add-issue-search-input'), 'slow')
    expect(screen.queryByTestId('add-issue-option-7')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-issue-option-12')).toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    renderDialog()
    await userEvent.type(screen.getByTestId('add-issue-search-input'), 'nothing like this')
    expect(screen.getByTestId('add-issue-empty')).toBeInTheDocument()
  })
})

/**
 * The list only carries *open* issues, so pasting a reference is the only way to reach a closed one
 * — which is why the pasted row exists even when the search matches nothing.
 */
describe('AddIssueDialog — pasting a reference', () => {
  it.each([
    ['99', 99],
    ['#99', 99],
    ['https://github.com/acme/widgets/issues/99', 99],
  ])('offers %s as an issue to track', async (typed, expected) => {
    const onSubmit = renderDialog()

    await userEvent.type(screen.getByTestId('add-issue-search-input'), typed)
    await userEvent.click(screen.getByTestId('add-issue-pasted'))
    await userEvent.click(screen.getByTestId('add-issue-submit'))

    expect(onSubmit).toHaveBeenCalledWith(expected, 'todo')
  })

  it('does not offer a pasted row for an issue already in the list', async () => {
    renderDialog()
    await userEvent.type(screen.getByTestId('add-issue-search-input'), '7')
    expect(screen.queryByTestId('add-issue-pasted')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-issue-option-7')).toBeInTheDocument()
  })

  it('offers nothing for text that is not a reference', async () => {
    renderDialog()
    await userEvent.type(screen.getByTestId('add-issue-search-input'), 'not a number')
    expect(screen.queryByTestId('add-issue-pasted')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-issue-submit')).toBeDisabled()
  })
})

/**
 * One issue, at most one card. Two cards tracking the same issue would each claim to own its content
 * and overwrite the other on every edit.
 */
describe('AddIssueDialog — an issue already on the board', () => {
  it('shows it, but refuses to select it', async () => {
    renderDialog({ trackedIssueNumbers: [7] })

    const row = screen.getByTestId('add-issue-option-7')
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('On board')

    await userEvent.click(row)
    expect(screen.getByTestId('add-issue-submit')).toBeDisabled()
  })

  it('leaves the other issues selectable', async () => {
    const onSubmit = renderDialog({ trackedIssueNumbers: [7] })
    await userEvent.click(screen.getByTestId('add-issue-option-12'))
    await userEvent.click(screen.getByTestId('add-issue-submit'))
    expect(onSubmit).toHaveBeenCalledWith(12, 'todo')
  })

  /** Pasting is the other way in, so it has to refuse too — and say why rather than just sit
   * disabled. */
  it('refuses a pasted reference to an issue already on the board', async () => {
    renderDialog({ trackedIssueNumbers: [99] })

    await userEvent.type(screen.getByTestId('add-issue-search-input'), '99')
    const row = screen.getByTestId('add-issue-pasted')
    expect(row).toHaveTextContent('Already on this board')
    expect(row).toBeDisabled()
    expect(screen.getByTestId('add-issue-submit')).toBeDisabled()
  })
})

describe('AddIssueDialog — lifecycle', () => {
  it('fetches only while it is open', () => {
    render(
      <AddIssueDialog
        open={false}
        onOpenChange={() => {}}
        repoPath="/repo"
        columns={columns}
        onSubmit={vi.fn()}
      />
    )
    expect(useRepoOpenIssues).toHaveBeenCalledWith('/repo', false)
  })

  it('clears the search each time it reopens', () => {
    const { rerender } = render(
      <AddIssueDialog
        open={false}
        onOpenChange={() => {}}
        repoPath="/repo"
        columns={columns}
        onSubmit={vi.fn()}
      />
    )
    rerender(
      <AddIssueDialog
        open
        onOpenChange={() => {}}
        repoPath="/repo"
        columns={columns}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByTestId('add-issue-search-input')).toHaveValue('')
  })
})
