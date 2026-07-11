import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { DayCommit } from '../types'
import { YearHeatmap } from './YearHeatmap'

describe('YearHeatmap — day-of-week labels', () => {
  it('shows Mon/Wed/Fri and blanks the other days', () => {
    render(<YearHeatmap yearDays={[{ date: '2024-01-01', commits: 1 }]} />)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Fri')).toBeInTheDocument()
  })
})

describe('YearHeatmap — grid alignment (padding)', () => {
  it('pads with empty cells before the first day, aligned to its weekday', () => {
    // 2024-01-03 is a Wednesday (ISO weekday index 2, Monday=0) — so the single real day should
    // be preceded by 2 blank placeholder cells in its week column.
    const { container } = render(<YearHeatmap yearDays={[{ date: '2024-01-03', commits: 5 }]} />)
    // 2 leading blanks + 4 trailing blanks (no data for the rest of that week) = 6 placeholders.
    expect(container.querySelectorAll('.bg-transparent')).toHaveLength(6)
  })

  it('adds no padding when the data starts on a Monday and fills a full week', () => {
    // 2024-01-01 is a Monday, and providing all 7 days leaves no leading or trailing blanks.
    const week: DayCommit[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2024-01-0${i + 1}`,
      commits: 1,
    }))
    const { container } = render(<YearHeatmap yearDays={week} />)
    expect(container.querySelectorAll('.bg-transparent')).toHaveLength(0)
  })
})

describe('YearHeatmap — heat color scale', () => {
  it('buckets each cell into the correct color band', () => {
    const week: DayCommit[] = [
      { date: '2024-01-01', commits: 0 },
      { date: '2024-01-02', commits: 2 },
      { date: '2024-01-03', commits: 6 },
      { date: '2024-01-04', commits: 11 },
      { date: '2024-01-05', commits: 15 },
      { date: '2024-01-06', commits: 19 },
      { date: '2024-01-07', commits: 20 },
    ]
    const { container } = render(<YearHeatmap yearDays={week} />)
    // The legend at the bottom always renders one swatch per color band, so grid cells are
    // distinguished from legend swatches via the `.cursor-pointer` class (legend swatches lack it).
    expect(container.querySelectorAll('.cursor-pointer.bg-muted\\/40')).toHaveLength(1) // 0 commits
    expect(container.querySelectorAll('.cursor-pointer.bg-green-900\\/60')).toHaveLength(1) // 2/20 = 0.1
    expect(container.querySelectorAll('.cursor-pointer.bg-green-700\\/70')).toHaveLength(1) // 6/20 = 0.3
    expect(container.querySelectorAll('.cursor-pointer.bg-green-600\\/80')).toHaveLength(1) // 11/20 = 0.55
    expect(container.querySelectorAll('.cursor-pointer.bg-green-500\\/90')).toHaveLength(1) // 15/20 = 0.75
    // 19/20 = 0.95 and 20/20 = 1.0 both land in the top band
    expect(container.querySelectorAll('.cursor-pointer.bg-green-400')).toHaveLength(2)
  })
})

describe('YearHeatmap — month labels', () => {
  it('labels the first week with its month', () => {
    render(<YearHeatmap yearDays={[{ date: '2024-01-01', commits: 1 }]} />)
    expect(screen.getByText('Jan')).toBeInTheDocument()
  })
})

describe('YearHeatmap — tooltip', () => {
  it('shows the contribution count and date on hover, pluralized correctly', () => {
    const { container } = render(
      <YearHeatmap
        yearDays={[
          { date: '2024-01-01', commits: 1 },
          { date: '2024-01-02', commits: 3 },
        ]}
      />
    )
    const cells = container.querySelectorAll('.cursor-pointer')
    fireEvent.mouseEnter(cells[0])
    expect(screen.getByText('1 contribution on Jan 1, 2024')).toBeInTheDocument()

    fireEvent.mouseEnter(cells[1])
    expect(screen.getByText('3 contributions on Jan 2, 2024')).toBeInTheDocument()
  })

  it('hides the tooltip on mouse leave', () => {
    const { container } = render(<YearHeatmap yearDays={[{ date: '2024-01-01', commits: 1 }]} />)
    const cell = container.querySelector('.cursor-pointer')!
    fireEvent.mouseEnter(cell)
    expect(screen.getByText('1 contribution on Jan 1, 2024')).toBeInTheDocument()
    fireEvent.mouseLeave(cell)
    expect(screen.queryByText('1 contribution on Jan 1, 2024')).not.toBeInTheDocument()
  })
})

describe('YearHeatmap — legend', () => {
  it('shows Less/More labels and 6 swatches', () => {
    render(<YearHeatmap yearDays={[{ date: '2024-01-01', commits: 1 }]} />)
    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
    const legend = screen.getByText('Less').parentElement!
    expect(legend.querySelectorAll('.rounded-sm')).toHaveLength(6)
  })
})
