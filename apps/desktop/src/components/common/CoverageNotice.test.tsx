import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DiffCoverage } from '@git-manager/ai'
import { CoverageNotice } from './CoverageNotice'

function coverage(overrides: Partial<DiffCoverage> = {}): DiffCoverage {
  return {
    filesRead: 8,
    filesTotal: 8,
    complete: true,
    requiredContextTokens: 8192,
    windowTooSmall: false,
    ...overrides,
  }
}

describe('CoverageNotice', () => {
  it('renders nothing before anything has been generated', () => {
    const { container } = render(<CoverageNotice coverage={null} testIdPrefix="x" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says nothing when the whole change was read', () => {
    // The common case on a normal change. A line every run would be noise on a panel that already
    // carries an age line, a comparison and a stale-base warning.
    render(<CoverageNotice coverage={coverage()} testIdPrefix="x" />)
    expect(screen.queryByTestId('x-coverage')).not.toBeInTheDocument()
  })

  it('reports what it read and the window needed to read it all', () => {
    render(
      <CoverageNotice
        coverage={coverage({
          filesRead: 14,
          filesTotal: 50,
          complete: false,
          requiredContextTokens: 32768,
        })}
        testIdPrefix="x"
      />
    )
    const notice = screen.getByTestId('x-coverage')
    expect(notice).toHaveTextContent('Read 14 of 50 changed files in full')
    expect(notice).toHaveTextContent('about a 32k-token context window')
  })

  it('is informational, not an alarm', () => {
    // Deliberate: the prompt no longer overflows, it reads less. That is a fact with an action
    // attached, not a failure — so it must not be styled like the danger it used to be.
    render(
      <CoverageNotice coverage={coverage({ filesRead: 2, complete: false })} testIdPrefix="x" />
    )
    expect(screen.getByTestId('x-coverage').className).toContain('text-muted-foreground')
  })

  it('warns when the window leaves no room for any diff', () => {
    // The one state trimming cannot fix, and so the only one still styled as a warning.
    render(
      <CoverageNotice
        coverage={coverage({ filesRead: 0, complete: false, windowTooSmall: true })}
        testIdPrefix="x"
      />
    )
    const warning = screen.getByTestId('x-window-too-small')
    expect(warning).toHaveTextContent('leaves no room for the diff')
    expect(warning.className).toContain('text-tone-danger')
  })

  it('stays quiet about the window when it is usable', () => {
    render(<CoverageNotice coverage={coverage()} testIdPrefix="x" />)
    expect(screen.queryByTestId('x-window-too-small')).not.toBeInTheDocument()
  })

  it('namespaces its testids, so two panels can carry one each', () => {
    render(
      <CoverageNotice coverage={coverage({ complete: false })} testIdPrefix="commit-explanation" />
    )
    expect(screen.getByTestId('commit-explanation-coverage')).toBeInTheDocument()
  })
})
