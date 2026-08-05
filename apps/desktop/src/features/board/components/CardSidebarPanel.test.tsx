import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useBoardStore } from '../stores/board.store'
import { CardSidebarPanel } from './CardSidebarPanel'
import { CardContentSection } from './CardContentSection'

beforeEach(() => {
  useBoardStore.setState({ collapsedCardSections: {} })
})

describe('CardSidebarPanel', () => {
  it('shows its title and its fields', () => {
    render(
      <CardSidebarPanel title="Details" sectionKey="k" testId="panel">
        <p>Inside</p>
      </CardSidebarPanel>
    )
    expect(screen.getByTestId('panel')).toHaveTextContent('Details')
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })

  it('folds and unfolds on the header', async () => {
    render(
      <CardSidebarPanel title="Details" sectionKey="k" testId="panel">
        <p>Inside</p>
      </CardSidebarPanel>
    )
    await userEvent.click(screen.getByTestId('panel-toggle'))
    expect(screen.queryByText('Inside')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('panel-toggle'))
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })

  /** Per section rather than per card: "I never look at the checklist" is a statement about the
   * section, and re-folding it on every card opened would make the preference worthless. */
  it('remembers the fold across cards, by section key', () => {
    useBoardStore.setState({ collapsedCardSections: { details: true } })
    render(
      <CardSidebarPanel title="Details" sectionKey="details" testId="panel">
        <p>Inside</p>
      </CardSidebarPanel>
    )
    expect(screen.queryByText('Inside')).not.toBeInTheDocument()
  })

  it('leaves a panel with another key alone', () => {
    useBoardStore.setState({ collapsedCardSections: { pinned: true } })
    render(
      <CardSidebarPanel title="Details" sectionKey="details" testId="panel">
        <p>Inside</p>
      </CardSidebarPanel>
    )
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })
})

describe('CardContentSection', () => {
  it('keeps its aside visible while folded, since that is what says whether to unfold', async () => {
    render(
      <CardContentSection
        title="Checklist"
        sectionKey="dod"
        testId="section"
        aside={<span data-testid="progress">1/5</span>}
      >
        <p>Items</p>
      </CardContentSection>
    )
    await userEvent.click(screen.getByTestId('section-toggle'))

    expect(screen.queryByText('Items')).not.toBeInTheDocument()
    expect(screen.getByTestId('progress')).toBeInTheDocument()
  })

  it('announces whether it is expanded', async () => {
    render(
      <CardContentSection title="Checklist" sectionKey="dod" testId="section">
        <p>Items</p>
      </CardContentSection>
    )
    expect(screen.getByTestId('section-toggle')).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(screen.getByTestId('section-toggle'))
    expect(screen.getByTestId('section-toggle')).toHaveAttribute('aria-expanded', 'false')
  })
})
