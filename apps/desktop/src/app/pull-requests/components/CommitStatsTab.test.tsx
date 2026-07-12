import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DayCommit } from '../types'
import { CommitStatsTab } from './CommitStatsTab'

const commitDays: DayCommit[] = [
  { date: '2024-01-01', commits: 2 },
  { date: '2024-01-02', commits: 0 },
  { date: '2024-01-03', commits: 5 },
]
const yearDays: DayCommit[] = [
  { date: '2023-12-30', commits: 0 },
  { date: '2023-12-31', commits: 1 },
  { date: '2024-01-01', commits: 3 },
]

describe('CommitStatsTab — loading state', () => {
  it('shows skeleton placeholders and no KPI values', () => {
    const { container } = render(
      <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading />
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.getByText('Loading contribution map...')).toBeInTheDocument()
    expect(screen.queryByText('4')).not.toBeInTheDocument()
  })
})

describe('CommitStatsTab — KPI cards', () => {
  it('computes total commits over the year', () => {
    render(<CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />)
    expect(screen.getByText('Total commits')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument() // 0 + 1 + 3
  })

  it('computes the 14-day daily average and total', () => {
    render(<CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />)
    expect(screen.getByText('2.3')).toBeInTheDocument() // (2+0+5)/3 = 2.33
    expect(screen.getByText('7')).toBeInTheDocument() // 2+0+5
  })

  it('computes the current streak by counting back from the last year day', () => {
    // yearDays ends with commits:3 (non-zero) preceded by commits:1 (non-zero) then commits:0 — streak of 2.
    render(<CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />)
    expect(screen.getByText('2d')).toBeInTheDocument()
  })

  it('shows a 0-day streak when the most recent year day has zero commits', () => {
    const days = [...yearDays.slice(0, -1), { date: '2024-01-01', commits: 0 }]
    render(<CommitStatsTab commitDays={commitDays} yearDays={days} loading={false} />)
    expect(screen.getByText('0d')).toBeInTheDocument()
  })

  it('shows a 0 average when there are no 14-day commit entries', () => {
    render(<CommitStatsTab commitDays={[]} yearDays={yearDays} loading={false} />)
    expect(screen.getByText('Daily avg (14d)')).toBeInTheDocument()
    // Both "Daily avg (14d)" and "Last 14 days" KPI cards read 0 when commitDays is empty.
    expect(screen.getAllByText('0')).toHaveLength(2)
  })
})

describe('CommitStatsTab — contribution activity', () => {
  it('shows the total-contributions caption when loaded', () => {
    render(<CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />)
    expect(screen.getByText('4 contributions in the last year')).toBeInTheDocument()
  })

  it('renders the heatmap when not loading', () => {
    render(<CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />)
    expect(screen.queryByText('Loading contribution map...')).not.toBeInTheDocument()
  })
})

describe('CommitStatsTab — daily bars', () => {
  it('renders one bar per commit day with its hover tooltip count', () => {
    const { container } = render(
      <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />
    )
    const bars = container.querySelectorAll('[class*="group/bar"]')
    expect(bars).toHaveLength(3)
    // The "5" hover tooltip also matches the daily-breakdown list's count for the same day.
    expect(screen.getAllByText('5')).toHaveLength(2)
  })

  it('shows first and last day date range labels', () => {
    render(<CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />)
    // "Jan 1"/"Jan 3" also appear as row labels in the daily-breakdown list below.
    expect(screen.getAllByText('Jan 1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Jan 3').length).toBeGreaterThanOrEqual(1)
  })

  it('shows no date range labels when there are no commit days', () => {
    const { container } = render(
      <CommitStatsTab commitDays={[]} yearDays={yearDays} loading={false} />
    )
    const rangeRow = container.querySelector('.flex.justify-between.mt-1')!
    expect(rangeRow.textContent).toBe('')
  })
})

describe('CommitStatsTab — daily breakdown list', () => {
  it('lists days in reverse order with their commit counts', () => {
    const { container } = render(
      <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={false} />
    )
    const rows = container.querySelectorAll('.divide-y > div')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Jan 3')
    expect(rows[2].textContent).toContain('Jan 1')
  })
})
