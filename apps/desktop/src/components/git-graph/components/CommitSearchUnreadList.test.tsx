import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ScanFailure, ScannedCommit } from '@git-manager/ai'
import { CommitSearchUnreadList } from './CommitSearchUnreadList'

function unread(shortOid: string, failure: ScanFailure): ScannedCommit {
  return {
    commit: {
      oid: shortOid.padEnd(40, '0'),
      shortOid,
      subject: 'feat: something the model choked on',
      body: '',
      author: 'Ada',
      timestamp: 1_783_987_200,
      files: [],
      filesTruncated: false,
      insertions: 1,
      deletions: 0,
      parentCount: 1,
    },
    relevant: false,
    finding: '',
    files: [],
    failed: true,
    failure,
    filesRead: 0,
  }
}

describe('CommitSearchUnreadList', () => {
  it('shows nothing when every commit was read', () => {
    render(<CommitSearchUnreadList unread={[]} onOpenCommit={vi.fn()} />)
    expect(screen.queryByTestId('commit-search-unread')).not.toBeInTheDocument()
  })

  /**
   * A model that ignores the requested JSON format fails every commit identically — so the fix is
   * "change model", not "retry". Saying only "N commits could not be read" hid that entirely.
   */
  it('blames the output format when the answer could not be read', () => {
    render(<CommitSearchUnreadList unread={[unread('aaa1111', 'unreadable')]} onOpenCommit={vi.fn()} />)
    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent(
      /ignores the JSON format the app asks for/i
    )
  })

  it('blames the provider when it never answered', () => {
    render(<CommitSearchUnreadList unread={[unread('bbb2222', 'call')]} onOpenCommit={vi.fn()} />)
    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent(/did not answer/i)
  })

  it('blames the repository when the diff would not load', () => {
    render(<CommitSearchUnreadList unread={[unread('ccc3333', 'diff')]} onOpenCommit={vi.fn()} />)
    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent(
      /diff could not be loaded/i
    )
  })

  it('states each cause once, however many commits hit it', () => {
    render(
      <CommitSearchUnreadList
        unread={[unread('aaa1111', 'unreadable'), unread('bbb2222', 'unreadable')]}
        onOpenCommit={vi.fn()}
      />
    )
    const explanations = screen.getAllByText(/ignores the JSON format the app asks for/i)
    expect(explanations).toHaveLength(1)
    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent('2 commit(s) left unread')
  })

  it('spells out what their absence means for the answer', () => {
    render(<CommitSearchUnreadList unread={[unread('aaa1111', 'call')]} onOpenCommit={vi.fn()} />)
    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent(
      /missing from the answer above/i
    )
  })

  it('opens a commit so it can be read by hand', async () => {
    const user = userEvent.setup()
    const onOpenCommit = vi.fn()
    render(<CommitSearchUnreadList unread={[unread('aaa1111', 'call')]} onOpenCommit={onOpenCommit} />)

    await user.click(screen.getByTestId('commit-search-unread-aaa1111'))
    expect(onOpenCommit).toHaveBeenCalledWith('aaa1111'.padEnd(40, '0'))
  })
})
