import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhRawPR } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { setState, toggleDraft } = vi.hoisted(() => ({ setState: vi.fn(), toggleDraft: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ setState, toggleDraft, pending: false }),
}))

import { PrStateActions } from './PrStateActions'

function pr(overrides: Partial<GhRawPR> = {}): GhRawPR {
  return {
    number: 7,
    node_id: 'PR_node',
    title: 'T',
    html_url: '',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PrStateActions', () => {
  it('renders nothing for a merged PR', () => {
    const { container } = render(
      <PrStateActions repoPath="/repo" prNumber={7} pr={pr({ merged_at: '2026-01-01', state: 'closed' })} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers convert-to-draft + close for an open, non-draft PR', async () => {
    const user = userEvent.setup()
    render(<PrStateActions repoPath="/repo" prNumber={7} pr={pr()} />)
    await user.click(screen.getByTestId('pr-convert-draft'))
    expect(toggleDraft).toHaveBeenCalledWith('PR_node', true)
    await user.click(screen.getByTestId('pr-close'))
    expect(setState).toHaveBeenCalledWith('closed')
  })

  it('offers mark-ready for an open draft PR', async () => {
    const user = userEvent.setup()
    render(<PrStateActions repoPath="/repo" prNumber={7} pr={pr({ draft: true })} />)
    await user.click(screen.getByTestId('pr-mark-ready'))
    expect(toggleDraft).toHaveBeenCalledWith('PR_node', false)
  })

  it('offers reopen (and no draft toggle) for a closed PR', async () => {
    const user = userEvent.setup()
    render(<PrStateActions repoPath="/repo" prNumber={7} pr={pr({ state: 'closed' })} />)
    expect(screen.queryByTestId('pr-convert-draft')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('pr-reopen'))
    expect(setState).toHaveBeenCalledWith('open')
  })

  it('hides the draft toggle when the PR has no node_id', () => {
    render(<PrStateActions repoPath="/repo" prNumber={7} pr={pr({ node_id: undefined })} />)
    expect(screen.queryByTestId('pr-convert-draft')).not.toBeInTheDocument()
    expect(screen.getByTestId('pr-close')).toBeInTheDocument()
  })
})
