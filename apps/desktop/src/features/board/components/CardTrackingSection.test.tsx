import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCard } from '../test/boardFactories'
import { CardTrackingSection } from './CardTrackingSection'

const { apiOpenUrl } = vi.hoisted(() => ({ apiOpenUrl: vi.fn() }))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))

const ref = { owner: 'acme', repo: 'widgets', number: 42 }

function renderSection(card = makeCard({ sourceIssue: ref, issueState: 'open' as const })) {
  const onUntrack = vi.fn().mockResolvedValue(undefined)
  render(<CardTrackingSection card={card} onUntrack={onUntrack} />)
  return onUntrack
}

beforeEach(() => vi.clearAllMocks())

describe('CardTrackingSection', () => {
  it('renders nothing for an untracked card', () => {
    render(<CardTrackingSection card={makeCard()} onUntrack={vi.fn()} />)
    expect(screen.queryByTestId('card-tracking')).not.toBeInTheDocument()
  })

  it('opens the issue on GitHub through the shell, not a bare link', async () => {
    renderSection()
    await userEvent.click(screen.getByTestId('card-tracking-link'))
    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/acme/widgets/issues/42')
  })

  it('shows the issue state', () => {
    renderSection()
    expect(screen.getByTestId('card-tracking-state-open')).toHaveTextContent('Open')
  })

  it('shows a closed issue as closed', () => {
    renderSection(makeCard({ sourceIssue: ref, issueState: 'closed' }))
    expect(screen.getByTestId('card-tracking-state-closed')).toHaveTextContent('Closed')
  })

  /**
   * "Could not reach GitHub" is a third state, not a synonym for open: the content on screen is the
   * last known copy, and saying "open" would assert something unverified.
   */
  it('distinguishes an unreachable issue from an open one', () => {
    renderSection(makeCard({ sourceIssue: ref, issueState: undefined }))
    expect(screen.getByTestId('card-tracking-unreachable')).toBeInTheDocument()
    expect(screen.queryByTestId('card-tracking-state-open')).not.toBeInTheDocument()
  })

  it('warns that editing the card edits the issue', () => {
    renderSection()
    expect(screen.getByText('Editing this card edits the GitHub issue.')).toBeInTheDocument()
  })

  it('untracks on request', async () => {
    const onUntrack = renderSection()
    await userEvent.click(screen.getByTestId('card-tracking-untrack'))
    expect(onUntrack).toHaveBeenCalledTimes(1)
  })

  it('offers no untrack control on a closed sprint’s card', () => {
    render(
      <CardTrackingSection
        card={makeCard({ sourceIssue: ref, issueState: 'open' })}
        onUntrack={vi.fn()}
        readOnly
      />
    )
    expect(screen.queryByTestId('card-tracking-untrack')).not.toBeInTheDocument()
    // The link out stays: a read-only sprint is still readable.
    expect(screen.getByTestId('card-tracking-link')).toBeInTheDocument()
  })
})
