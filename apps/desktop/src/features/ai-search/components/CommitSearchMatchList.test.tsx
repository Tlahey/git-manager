import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StoredSearchMatch } from '../stores/aiCommitSearch.store'
import { CommitSearchMatchList } from './CommitSearchMatchList'

function match(overrides: Partial<StoredSearchMatch> = {}): StoredSearchMatch {
  return {
    oid: 'a'.repeat(40),
    shortOid: 'aaaaaaa',
    subject: 'feat(ui): loading state on Button',
    author: 'Ada',
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    finding: 'Adds a loading state and drops the spinner prop.',
    files: ['packages/ui/src/Button.tsx'],
    ...overrides,
  }
}

describe('CommitSearchMatchList', () => {
  it('shows nothing at all when there is no match', () => {
    render(<CommitSearchMatchList matches={[]} onOpenCommit={vi.fn()} />)
    expect(screen.queryByTestId('commit-search-matches')).not.toBeInTheDocument()
  })

  it('counts the commits it found', () => {
    render(
      <CommitSearchMatchList
        matches={[match(), match({ oid: 'b'.repeat(40), shortOid: 'bbbbbbb' })]}
        onOpenCommit={vi.fn()}
      />
    )
    expect(screen.getByText('Commits found (2)')).toBeInTheDocument()
  })

  it('shows what the model said about each commit, with the files it named', () => {
    render(<CommitSearchMatchList matches={[match()]} onOpenCommit={vi.fn()} />)
    const row = screen.getByTestId('commit-search-match-aaaaaaa')
    expect(row).toHaveTextContent('feat(ui): loading state on Button')
    expect(row).toHaveTextContent('Adds a loading state and drops the spinner prop.')
    expect(row).toHaveTextContent('packages/ui/src/Button.tsx')
    expect(row).toHaveTextContent('Ada')
  })

  it('opens the commit it was clicked on — the answer is only useful if you can go and look', async () => {
    const user = userEvent.setup()
    const onOpenCommit = vi.fn()
    render(<CommitSearchMatchList matches={[match()]} onOpenCommit={onOpenCommit} />)

    await user.click(screen.getByTestId('commit-search-match-aaaaaaa'))
    expect(onOpenCommit).toHaveBeenCalledWith('a'.repeat(40))
  })

  it('names the commit in the row’s accessible label', () => {
    render(<CommitSearchMatchList matches={[match()]} onOpenCommit={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Show commit aaaaaaa in the graph' })
    ).toBeInTheDocument()
  })

  it('handles a match the model attached no file to', () => {
    render(<CommitSearchMatchList matches={[match({ files: [] })]} onOpenCommit={vi.fn()} />)
    expect(screen.getByTestId('commit-search-match-aaaaaaa')).toBeInTheDocument()
  })
})
