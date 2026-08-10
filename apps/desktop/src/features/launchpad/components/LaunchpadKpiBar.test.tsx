import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaunchpadKpiBar } from './LaunchpadKpiBar'

const FIGURES = {
  openPRsCount: 3,
  needsReviewCount: 2,
  openIssuesCount: 4,
  ciPassRate: 87,
  weekCommits: 12,
}

describe('LaunchpadKpiBar', () => {
  it('labels and shows all five figures', () => {
    render(<LaunchpadKpiBar {...FIGURES} loading={false} />)
    expect(screen.getByText('Open PRs')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Open issues')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  // A zero that is really "not loaded yet" would read as a fact; the cards take the flag instead.
  it('hands the loading flag down rather than rendering zeroes as figures', () => {
    render(<LaunchpadKpiBar {...FIGURES} loading />)
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    expect(screen.getByText('Open PRs')).toBeInTheDocument()
  })
})
