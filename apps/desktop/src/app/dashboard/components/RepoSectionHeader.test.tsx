import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepoSectionHeader } from './RepoSectionHeader'
import type { RepoSelection } from '../hooks/useRepoSelection'
import type { SectionAction } from '../hooks/useSectionActions'
import { useDashboardStore } from '../../../stores/dashboard.store'

const ALL_PATHS = ['/repo/a', '/repo/b']

function selection(overrides: Partial<RepoSelection> = {}): RepoSelection {
  return {
    selectedPaths: [],
    isSelected: () => false,
    toggle: vi.fn(),
    toggleAll: vi.fn(),
    selectAll: vi.fn(),
    clear: vi.fn(),
    allSelected: false,
    someSelected: false,
    ...overrides,
  }
}

function action(id: string, label: string): SectionAction {
  return { id, label, run: vi.fn() }
}

function renderHeader(props: Partial<React.ComponentProps<typeof RepoSectionHeader>> = {}) {
  const defaults: React.ComponentProps<typeof RepoSectionHeader> = {
    sectionId: 'open',
    icon: <span data-testid="section-icon" />,
    title: 'Open repositories',
    count: 2,
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    selection: selection(),
    allPaths: ALL_PATHS,
    lead: { id: 'close-repos', label: 'Close repositories', run: vi.fn(), destructive: true },
    showRepoTools: true,
    extraOptions: [],
    onFetch: vi.fn(),
    onPull: vi.fn(),
    onOpenInEditor: vi.fn(),
    bulkState: { isRunning: false, done: 0, total: 0, errors: [] },
  }
  const merged = { ...defaults, ...props }
  return { ...render(<RepoSectionHeader {...merged} />), props: merged }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDashboardStore.setState({ collapsedSections: {}, hiddenSections: {}, sectionColors: {} })
})

describe('RepoSectionHeader — title and fold control', () => {
  it('shows the title, icon and count', () => {
    renderHeader({ title: 'Favorites', count: 7 })
    expect(screen.getByText('Favorites')).toBeInTheDocument()
    expect(screen.getByTestId('section-icon')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('reports the expanded state and offers to collapse', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader({ isCollapsed: false })
    const toggle = screen.getByTestId('dashboard-section-toggle-open')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAccessibleName('Collapse section')
    await user.click(toggle)
    expect(props.onToggleCollapse).toHaveBeenCalledOnce()
  })

  it('reports the collapsed state and offers to expand', () => {
    renderHeader({ isCollapsed: true })
    expect(screen.getByTestId('dashboard-section-toggle-open')).toHaveAccessibleName(
      'Expand section'
    )
  })
})

describe('RepoSectionHeader — targeting', () => {
  it('acts on the whole section when nothing is checked', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader()
    await user.click(screen.getByTestId('dashboard-section-fetch-open'))
    expect(props.onFetch).toHaveBeenCalledWith(ALL_PATHS)
  })

  it('acts on the checked rows only when there is a selection', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader({
      selection: selection({ selectedPaths: ['/repo/a'], someSelected: true }),
    })
    await user.click(screen.getByTestId('dashboard-section-fetch-open'))
    expect(props.onFetch).toHaveBeenCalledWith(['/repo/a'])
  })

  it('shows how many rows are selected, so the target is never ambiguous', () => {
    renderHeader({ selection: selection({ selectedPaths: ['/repo/a'], someSelected: true }) })
    expect(screen.getByTestId('dashboard-section-selected-count-open')).toHaveTextContent(
      '1 selected'
    )
  })

  it('hides the selected-count chip when nothing is checked', () => {
    renderHeader()
    expect(screen.queryByTestId('dashboard-section-selected-count-open')).toBeNull()
  })
})

describe('RepoSectionHeader — select-all checkbox', () => {
  it('is hidden for an empty section', () => {
    renderHeader({ count: 0 })
    expect(screen.queryByTestId('dashboard-section-select-all-open')).toBeNull()
  })

  it('is checked when everything is selected', () => {
    renderHeader({ selection: selection({ selectedPaths: ALL_PATHS, allSelected: true }) })
    expect(screen.getByTestId('dashboard-section-select-all-open')).toBeChecked()
  })

  it('is mixed when only some rows are selected', () => {
    renderHeader({ selection: selection({ selectedPaths: ['/repo/a'], someSelected: true }) })
    expect(screen.getByTestId('dashboard-section-select-all-open')).toHaveAttribute(
      'aria-checked',
      'mixed'
    )
  })
})

describe('RepoSectionHeader — repo tools', () => {
  it('opens the strategy menu instead of pulling straight away', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader()
    await user.click(screen.getByTestId('dashboard-section-pull-open'))
    // A single click must never run a pull the user did not explicitly choose.
    expect(props.onPull).not.toHaveBeenCalled()
    expect(await screen.findByText('Pull (fast-forward if possible)')).toBeInTheDocument()
  })

  it('offers the three pull strategies in its menu', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByTestId('dashboard-section-pull-open'))
    expect(await screen.findByText('Pull (fast-forward if possible)')).toBeInTheDocument()
    expect(screen.getByText('Pull (fast-forward only)')).toBeInTheDocument()
    expect(screen.getByText('Pull (rebase)')).toBeInTheDocument()
  })

  it('pulls with the strategy picked from the menu', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader()
    await user.click(screen.getByTestId('dashboard-section-pull-open'))
    await user.click(await screen.findByTestId('dashboard-section-pull-open-rebase'))
    expect(props.onPull).toHaveBeenCalledWith(ALL_PATHS, 'rebase')
  })

  it('pulls with the default strategy when it is picked from the menu', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader()
    await user.click(screen.getByTestId('dashboard-section-pull-open'))
    await user.click(await screen.findByTestId('dashboard-section-pull-open-fast-forward-if-possible'))
    expect(props.onPull).toHaveBeenCalledWith(ALL_PATHS, 'fast-forward-if-possible')
  })

  it('labels fetch and pull with icons only, naming them for assistive tech', () => {
    renderHeader()
    const fetch = screen.getByTestId('dashboard-section-fetch-open')
    const pull = screen.getByTestId('dashboard-section-pull-open')
    expect(fetch).toHaveAccessibleName('Fetch repositories')
    expect(pull).toHaveAccessibleName('Pull repositories')
    // Icon-only: no visible label text inside either button.
    expect(fetch).toHaveTextContent('')
    expect(pull).toHaveTextContent('')
  })

  it('shows the fetch label in a tooltip on hover', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.hover(screen.getByTestId('dashboard-section-fetch-open'))
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('Fetch repositories')
    )
  })

  it('carries a downward chevron inside the pull button as its expander', () => {
    renderHeader()
    const pull = screen.getByTestId('dashboard-section-pull-open')
    expect(pull.querySelector('.lucide-chevron-down')).toBeTruthy()
  })

  it('opens the selected repos in the external editor', async () => {
    const user = userEvent.setup()
    const { props } = renderHeader()
    await user.click(screen.getByTestId('dashboard-section-editor-open'))
    expect(props.onOpenInEditor).toHaveBeenCalledWith(ALL_PATHS)
  })

  it('hides the tools for a section that does not have them', () => {
    renderHeader({ showRepoTools: false })
    expect(screen.queryByTestId('dashboard-section-fetch-open')).toBeNull()
    expect(screen.queryByTestId('dashboard-section-pull-open')).toBeNull()
    expect(screen.queryByTestId('dashboard-section-editor-open')).toBeNull()
  })

  it('hides the tools for an empty section', () => {
    renderHeader({ count: 0 })
    expect(screen.queryByTestId('dashboard-section-fetch-open')).toBeNull()
  })

  it('disables the tools and shows progress while a run is in flight', () => {
    renderHeader({ bulkState: { isRunning: true, done: 1, total: 3, errors: [] } })
    expect(screen.getByTestId('dashboard-section-fetch-open')).toBeDisabled()
    expect(screen.getByTestId('dashboard-section-pull-open')).toBeDisabled()
    expect(screen.getByTestId('dashboard-section-progress-open')).toHaveTextContent('1 / 3')
  })
})

describe('RepoSectionHeader — leading action', () => {
  it('runs against the section when nothing is checked', async () => {
    const user = userEvent.setup()
    const lead = { id: 'close-repos', label: 'Close repositories', run: vi.fn() }
    renderHeader({ lead })
    await user.click(screen.getByTestId('dashboard-section-lead-open'))
    expect(lead.run).toHaveBeenCalledWith(ALL_PATHS)
  })

  it('is omitted when the section has none', () => {
    renderHeader({ lead: null })
    expect(screen.queryByTestId('dashboard-section-lead-open')).toBeNull()
  })

  it('is omitted for an empty section', () => {
    renderHeader({ count: 0 })
    expect(screen.queryByTestId('dashboard-section-lead-open')).toBeNull()
  })
})

describe('RepoSectionHeader — options menu', () => {
  it('hides the section', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    await user.click(await screen.findByTestId('dashboard-section-menu-open-hide'))
    expect(useDashboardStore.getState().hiddenSections.open).toBe(true)
  })

  it('selects and unselects every row', async () => {
    const user = userEvent.setup()
    const sel = selection()
    renderHeader({ selection: sel })

    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    await user.click(await screen.findByTestId('dashboard-section-menu-open-select-all'))
    expect(sel.selectAll).toHaveBeenCalledOnce()

    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    await user.click(await screen.findByTestId('dashboard-section-menu-open-unselect-all'))
    expect(sel.clear).toHaveBeenCalledOnce()
  })

  it('omits select/unselect for an empty section but keeps Hide', async () => {
    const user = userEvent.setup()
    renderHeader({ count: 0 })
    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    expect(await screen.findByTestId('dashboard-section-menu-open-hide')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-section-menu-open-select-all')).toBeNull()
  })

  it('runs an extra option against the current target', async () => {
    const user = userEvent.setup()
    const extra = action('open-all-new-tabs', 'Open all repositories in new tabs')
    renderHeader({ extraOptions: [extra] })
    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    await user.click(await screen.findByTestId('dashboard-section-menu-open-open-all-new-tabs'))
    expect(extra.run).toHaveBeenCalledWith(ALL_PATHS)
  })
})

describe('RepoSectionHeader — section colour', () => {
  it('starts uncoloured', () => {
    renderHeader()
    expect(screen.getByTestId('dashboard-section-header-open')).toHaveAttribute(
      'data-color',
      'none'
    )
  })

  it('applies a colour picked from the menu, and tints the header', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    await user.click(await screen.findByTestId('dashboard-color-open-emerald'))

    expect(useDashboardStore.getState().sectionColors.open).toBe('emerald')
    expect(screen.getByTestId('dashboard-section-header-open')).toHaveAttribute(
      'data-color',
      'emerald'
    )
  })

  it('clears the colour back to the default header', async () => {
    useDashboardStore.setState({ sectionColors: { open: 'rose' } })
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByTestId('dashboard-section-menu-open'))
    await user.click(await screen.findByTestId('dashboard-color-open-none'))
    expect(useDashboardStore.getState().sectionColors.open).toBeUndefined()
  })
})
