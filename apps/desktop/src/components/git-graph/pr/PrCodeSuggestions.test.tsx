import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PrReviewThread } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrReviewThreadsMock } = vi.hoisted(() => ({ usePrReviewThreadsMock: vi.fn() }))
vi.mock('../../../hooks/usePrReviewThreads', () => ({ usePrReviewThreads: usePrReviewThreadsMock }))

import { PrCodeSuggestions } from './PrCodeSuggestions'

function thread(overrides: Partial<PrReviewThread> = {}): PrReviewThread {
  return {
    id: 'T1',
    path: 'src/a.ts',
    line: 12,
    isOutdated: false,
    author: 'bob',
    snippet: 'Please rename this.',
    url: 'https://github.com/o/r/pull/7#discussion_r1',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('PrCodeSuggestions', () => {
  it('renders nothing when there are no unresolved threads', () => {
    usePrReviewThreadsMock.mockReturnValue({ threads: [], isLoading: false, refresh: vi.fn() })
    const { container } = render(<PrCodeSuggestions repoPath="/repo" prNumber={7} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists unresolved threads with a link to the comment', () => {
    usePrReviewThreadsMock.mockReturnValue({
      threads: [thread(), thread({ id: 'T2', path: 'src/b.ts', isOutdated: true })],
      isLoading: false,
      refresh: vi.fn(),
    })
    render(<PrCodeSuggestions repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('pr-code-suggestions')).toBeInTheDocument()
    const first = screen.getByTestId('pr-suggestion-T1')
    expect(first).toHaveAttribute('href', 'https://github.com/o/r/pull/7#discussion_r1')
    expect(first).toHaveTextContent('src/a.ts:12')
    expect(first).toHaveTextContent('Please rename this.')
    // The outdated thread carries the badge.
    expect(screen.getByTestId('pr-suggestion-T2')).toHaveTextContent('pr.suggestions.outdated')
  })
})
