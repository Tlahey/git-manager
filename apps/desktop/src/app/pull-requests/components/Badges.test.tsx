import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { PRStatus, CiDetail } from '../types'
import { StatusBadge, CiBadge } from './Badges'

describe('StatusBadge', () => {
  it.each([
    ['open', 'Open'],
    ['draft', 'Draft'],
    ['approved', 'Approved'],
    ['changes_requested', 'Changes'],
    ['merged', 'Merged'],
    ['closed', 'Closed'],
  ] as [PRStatus, string][])('labels %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('CiBadge — status only', () => {
  it('shows an em-dash for null status', () => {
    render(<CiBadge status={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows Pass with a green check for success', () => {
    const { container } = render(<CiBadge status="success" />)
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(container.querySelector('.text-tone-success')).toBeTruthy()
  })

  it('shows Fail with a red X for failure', () => {
    render(<CiBadge status="failure" />)
    expect(screen.getByText('Fail')).toBeInTheDocument()
  })

  it('shows a spinning Running label', () => {
    const { container } = render(<CiBadge status="running" />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('shows Skip for skipped', () => {
    render(<CiBadge status="skipped" />)
    expect(screen.getByText('Skip')).toBeInTheDocument()
  })
})

describe('CiBadge — with details tooltip', () => {
  const details: CiDetail[] = [
    { name: 'build', status: 'success' },
    { name: 'lint', status: 'failure' },
    { name: 'e2e', status: 'running' },
    { name: 'deploy', status: 'skipped' },
    { name: 'legacy', status: 'unknown' },
  ]

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reveals the per-step CI details after the hover delay', () => {
    render(<CiBadge status="success" details={details} />)
    // components/ui/Tooltip clones the mouse handlers directly onto the badge span (no extra
    // wrapper element) and shows its portal-rendered content after a delay — not based on
    // text overflow (that's a different component, HoverExpandLabel).
    fireEvent.mouseEnter(screen.getByText('Pass'))
    act(() => vi.advanceTimersByTime(150))

    expect(screen.getByText('CI Check Steps')).toBeInTheDocument()
    expect(screen.getByText('build')).toBeInTheDocument()
    expect(screen.getByText('lint')).toBeInTheDocument()
    expect(screen.getByText('e2e')).toBeInTheDocument()
    expect(screen.getByText('deploy')).toBeInTheDocument()
    expect(screen.getByText('legacy')).toBeInTheDocument()
  })

  it('hides the details again on mouse leave', () => {
    render(<CiBadge status="success" details={details} />)
    fireEvent.mouseEnter(screen.getByText('Pass'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByText('CI Check Steps')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('Pass'))
    expect(screen.queryByText('CI Check Steps')).not.toBeInTheDocument()
  })

  it('does not show a details panel when there are no details', () => {
    render(<CiBadge status="success" details={[]} />)
    fireEvent.mouseEnter(screen.getByText('Pass'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByText('CI Check Steps')).not.toBeInTheDocument()
  })
})
