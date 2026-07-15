import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { usePrDetailMock } = vi.hoisted(() => ({ usePrDetailMock: vi.fn() }))
vi.mock('../../../hooks/usePrDetail', () => ({ usePrDetail: usePrDetailMock }))

// Neutralise the data/action hooks the composed blocks pull in, so this test stays on composition.
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ updatePr: vi.fn(), updateBranch: vi.fn(), pending: false }),
}))
vi.mock('../../../hooks/usePrComments', () => ({
  usePrComments: () => ({ comments: [], isLoading: false, refresh: vi.fn() }),
}))
vi.mock('../../../hooks/usePrMergeability', () => ({
  usePrMergeability: () => ({ mergeability: undefined, isLoading: false, refresh: vi.fn() }),
}))

// Stub the interactive children so this test focuses on composition + header.
vi.mock('./PrMergeButton', () => ({ PrMergeButton: () => <div data-testid="stub-merge" /> }))
vi.mock('./PrCommentBox', () => ({ PrCommentBox: () => <div data-testid="stub-comment" /> }))

import { PrDetailCenter } from './PrDetailCenter'

function pr(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: 'Add feature',
    body: '## Summary\n\nHello',
    state: 'open',
    draft: false,
    merged_at: null,
    user: { login: 'alice', avatar_url: '' },
    head: { ref: 'feat/x', sha: 'abc' },
    base: { ref: 'main' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PrDetailCenter', () => {
  it('shows a loading state until the PR resolves', () => {
    usePrDetailMock.mockReturnValue({ pr: undefined, isLoading: true, error: null, mutate: vi.fn() })
    render(<PrDetailCenter repoPath="/repo" prNumber={7} onClose={vi.fn()} />)
    expect(screen.getByText('pr.view.loading')).toBeInTheDocument()
  })

  it('renders the PR title, meta, description and merge/comment blocks', () => {
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false, error: null, mutate: vi.fn() })
    render(<PrDetailCenter repoPath="/repo" prNumber={7} onClose={vi.fn()} />)
    expect(screen.getByTestId('pr-title')).toHaveTextContent('Add feature')
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByTestId('pr-merge-summary')).toHaveTextContent('alice')
    expect(screen.getByTestId('stub-merge')).toBeInTheDocument()
    expect(screen.getByTestId('stub-comment')).toBeInTheDocument()
    expect(screen.getByTestId('pr-state-badge')).toHaveTextContent('pr.state.open')
  })

  it('calls onClose when the back button is clicked', async () => {
    const onClose = vi.fn()
    usePrDetailMock.mockReturnValue({
      pr: pr({ body: '' }),
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })
    render(<PrDetailCenter repoPath="/repo" prNumber={7} onClose={onClose} />)
    await userEvent.setup().click(screen.getByTestId('pr-detail-back'))
    expect(onClose).toHaveBeenCalled()
  })
})
