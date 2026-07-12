import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConflictResolverHeader, type ConflictResolverHeaderProps } from './ConflictResolverHeader'

function props(overrides: Partial<ConflictResolverHeaderProps> = {}): ConflictResolverHeaderProps {
  return {
    actions: {},
    whitespaceMode: 'compare',
    setWhitespaceMode: vi.fn(),
    highlightMode: 'words',
    setHighlightMode: vi.fn(),
    collapseUnchanged: false,
    setCollapseUnchanged: vi.fn(),
    onNavigate: vi.fn(),
    canNavigatePrev: true,
    canNavigateNext: true,
    onApplyLeft: vi.fn(),
    onApplyRight: vi.fn(),
    onApplyAll: vi.fn(),
    onReset: vi.fn(),
    changesCount: 3,
    conflictsCount: 1,
    statuses: ['left-status', 'center-status', 'right-status'],
    panelWidths: [1, 1, 1],
    gapWidth: 8,
    ...overrides,
  }
}

describe('navigation', () => {
  it('calls onNavigate with "prev"/"next" and disables buttons per canNavigate flags', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <ConflictResolverHeader
        {...props({ onNavigate, canNavigatePrev: false, canNavigateNext: true })}
      />
    )

    expect(screen.getByTestId('merge-nav-prev')).toBeDisabled()
    expect(screen.getByTestId('merge-nav-next')).toBeEnabled()

    await user.click(screen.getByTestId('merge-nav-next'))
    expect(onNavigate).toHaveBeenCalledWith('next')
  })

  it('hides the navigation cluster when actions.navigation is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { navigation: false } })} />)
    expect(screen.queryByTestId('merge-nav-prev')).not.toBeInTheDocument()
  })
})

describe('apply non-conflicting changes', () => {
  it('wires the Left/All/Right buttons to their respective callbacks', async () => {
    const user = userEvent.setup()
    const onApplyLeft = vi.fn()
    const onApplyRight = vi.fn()
    const onApplyAll = vi.fn()
    render(<ConflictResolverHeader {...props({ onApplyLeft, onApplyRight, onApplyAll })} />)

    await user.click(screen.getByTestId('merge-apply-left-btn'))
    await user.click(screen.getByTestId('merge-apply-right-btn'))
    await user.click(screen.getByTestId('merge-apply-all-btn'))

    expect(onApplyLeft).toHaveBeenCalledOnce()
    expect(onApplyRight).toHaveBeenCalledOnce()
    expect(onApplyAll).toHaveBeenCalledOnce()
  })

  it('hides the apply module when actions.applyNonConflicting is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { applyNonConflicting: false } })} />)
    expect(screen.queryByTestId('merge-apply-left-btn')).not.toBeInTheDocument()
  })

  it('only shows the auto-merge wand when onApplyAuto is provided, even if actions.autoMerge is not false', () => {
    const { rerender } = render(<ConflictResolverHeader {...props({ onApplyAuto: undefined })} />)
    expect(screen.queryByTestId('merge-wand-btn')).not.toBeInTheDocument()

    rerender(<ConflictResolverHeader {...props({ onApplyAuto: vi.fn() })} />)
    expect(screen.getByTestId('merge-wand-btn')).toBeInTheDocument()
  })

  it('calls onApplyAuto when the wand button is clicked', async () => {
    const user = userEvent.setup()
    const onApplyAuto = vi.fn()
    render(<ConflictResolverHeader {...props({ onApplyAuto })} />)
    await user.click(screen.getByTestId('merge-wand-btn'))
    expect(onApplyAuto).toHaveBeenCalledOnce()
  })

  it('suppresses the wand even with a callback when actions.autoMerge is explicitly false', () => {
    render(
      <ConflictResolverHeader {...props({ onApplyAuto: vi.fn(), actions: { autoMerge: false } })} />
    )
    expect(screen.queryByTestId('merge-wand-btn')).not.toBeInTheDocument()
  })
})

describe('recalculate button', () => {
  it('only shows when onRecalculate is provided', () => {
    const { rerender } = render(<ConflictResolverHeader {...props({ onRecalculate: undefined })} />)
    expect(screen.queryByTestId('merge-recalc-btn')).not.toBeInTheDocument()
    rerender(<ConflictResolverHeader {...props({ onRecalculate: vi.fn() })} />)
    expect(screen.getByTestId('merge-recalc-btn')).toBeInTheDocument()
  })

  it('calls onRecalculate when clicked', async () => {
    const user = userEvent.setup()
    const onRecalculate = vi.fn()
    render(<ConflictResolverHeader {...props({ onRecalculate })} />)
    await user.click(screen.getByTestId('merge-recalc-btn'))
    expect(onRecalculate).toHaveBeenCalledOnce()
  })
})

describe('reset button', () => {
  it('calls onReset when clicked', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<ConflictResolverHeader {...props({ onReset })} />)
    await user.click(screen.getByTestId('merge-reset-btn'))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('hides the reset button when actions.reset is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { reset: false } })} />)
    expect(screen.queryByTestId('merge-reset-btn')).not.toBeInTheDocument()
  })
})

describe('stats', () => {
  it('pluralizes changes/conflicts counts', () => {
    render(<ConflictResolverHeader {...props({ changesCount: 1, conflictsCount: 1 })} />)
    expect(screen.getByTestId('merge-stats')).toHaveTextContent('1 change. 1 conflict.')
  })

  it('uses plural forms for counts other than 1, including 0', () => {
    render(<ConflictResolverHeader {...props({ changesCount: 0, conflictsCount: 3 })} />)
    expect(screen.getByTestId('merge-stats')).toHaveTextContent('0 changes. 3 conflicts.')
  })

  it('hides stats when actions.stats is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { stats: false } })} />)
    expect(screen.queryByTestId('merge-stats')).not.toBeInTheDocument()
  })
})

describe('whitespace dropdown', () => {
  it('opens on click, showing all three modes, and selecting one calls setWhitespaceMode and closes it', async () => {
    const user = userEvent.setup()
    const setWhitespaceMode = vi.fn()
    render(<ConflictResolverHeader {...props({ setWhitespaceMode, whitespaceMode: 'compare' })} />)

    await user.click(screen.getByTestId('merge-whitespace-dropdown-btn'))
    expect(screen.getByText('Ignore whitespace')).toBeInTheDocument()

    await user.click(screen.getByText('Ignore whitespace'))
    expect(setWhitespaceMode).toHaveBeenCalledWith('ignore')
    expect(screen.queryByText('Ignore leading/trailing whitespace')).not.toBeInTheDocument()
  })

  it('closes the dropdown on an outside click without changing the mode', async () => {
    const user = userEvent.setup()
    const setWhitespaceMode = vi.fn()
    render(
      <div>
        <div data-testid="outside">outside</div>
        <ConflictResolverHeader {...props({ setWhitespaceMode })} />
      </div>
    )
    await user.click(screen.getByTestId('merge-whitespace-dropdown-btn'))
    expect(screen.getByText('Ignore whitespace')).toBeInTheDocument()

    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByText('Ignore whitespace')).not.toBeInTheDocument()
    expect(setWhitespaceMode).not.toHaveBeenCalled()
  })

  it('hides the whitespace control when actions.whitespace is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { whitespace: false } })} />)
    expect(screen.queryByTestId('merge-whitespace-dropdown-btn')).not.toBeInTheDocument()
  })
})

describe('highlight mode dropdown', () => {
  it('opens on click and selecting a mode calls setHighlightMode and closes it', async () => {
    const user = userEvent.setup()
    const setHighlightMode = vi.fn()
    render(<ConflictResolverHeader {...props({ setHighlightMode, highlightMode: 'words' })} />)

    await user.click(screen.getByTestId('merge-highlight-dropdown-btn'))
    await user.click(screen.getByText('Highlight lines'))

    expect(setHighlightMode).toHaveBeenCalledWith('lines')
    // The trigger button still reads "Highlight words" because this is a controlled component and
    // the mock setter doesn't feed a new `highlightMode` prop back in — but the dropdown's option
    // list (which is what duplicated "Highlight lines" while open) should be gone now.
    expect(screen.queryAllByText('Highlight lines')).toHaveLength(0)
  })

  it('hides the highlight control when actions.highlight is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { highlight: false } })} />)
    expect(screen.queryByTestId('merge-highlight-dropdown-btn')).not.toBeInTheDocument()
  })
})

describe('collapse unchanged toggle', () => {
  it('calls setCollapseUnchanged with the inverse of the current value', async () => {
    const user = userEvent.setup()
    const setCollapseUnchanged = vi.fn()
    render(
      <ConflictResolverHeader {...props({ setCollapseUnchanged, collapseUnchanged: false })} />
    )
    await user.click(screen.getByTestId('merge-collapse-unchanged-btn'))
    expect(setCollapseUnchanged).toHaveBeenCalledWith(true)
  })

  it('hides the toggle when actions.collapseUnchanged is false', () => {
    render(<ConflictResolverHeader {...props({ actions: { collapseUnchanged: false } })} />)
    expect(screen.queryByTestId('merge-collapse-unchanged-btn')).not.toBeInTheDocument()
  })
})

describe('status bar / panel layout', () => {
  it('renders all three status slots in three-panel mode', () => {
    render(
      <ConflictResolverHeader {...props({ statuses: ['L', 'C', 'R'], panelWidths: [1, 1, 1] })} />
    )
    expect(screen.getByTestId('merge-header-left-status')).toHaveTextContent('L')
    expect(screen.getByTestId('merge-header-center-status')).toHaveTextContent('C')
    expect(screen.getByTestId('merge-header-right-status')).toHaveTextContent('R')
  })

  it('omits the right status slot in two-panel mode (panelWidths[2] === 0)', () => {
    render(
      <ConflictResolverHeader {...props({ statuses: ['L', 'C', 'R'], panelWidths: [1, 1, 0] })} />
    )
    expect(screen.getByTestId('merge-header-left-status')).toBeInTheDocument()
    expect(screen.getByTestId('merge-header-center-status')).toBeInTheDocument()
    expect(screen.queryByTestId('merge-header-right-status')).not.toBeInTheDocument()
  })
})
