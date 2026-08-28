import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitFileListHeader } from './CommitFileListHeader'

function baseProps(overrides: Partial<React.ComponentProps<typeof CommitFileListHeader>> = {}) {
  return {
    title: 'Modifications',
    collapsed: false,
    onToggleCollapse: vi.fn(),
    bodyVisible: true,
    viewMode: 'tree' as const,
    onViewModeChange: vi.fn(),
    showExpandCollapseAll: false,
    expandCollapseButtonState: 'expand' as const,
    onToggleExpandAll: vi.fn(),
    bulkStageTestId: 'file-list-bulk-stage',
    ...overrides,
  }
}

describe('CommitFileListHeader', () => {
  it('renders the title and the view mode toggle', () => {
    render(<CommitFileListHeader {...baseProps()} />)
    expect(screen.getByText('Modifications')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Flat list' })).toBeInTheDocument()
  })

  it('reports a view mode change', async () => {
    const onViewModeChange = vi.fn()
    const user = userEvent.setup()
    render(<CommitFileListHeader {...baseProps({ onViewModeChange })} />)
    await user.click(screen.getByRole('radio', { name: 'Flat list' }))
    expect(onViewModeChange).toHaveBeenCalledWith('list')
  })

  it('shows the expand/collapse-all link only when showExpandCollapseAll is set, in tree view', () => {
    const { rerender } = render(<CommitFileListHeader {...baseProps()} />)
    expect(screen.queryByText('Expand All')).not.toBeInTheDocument()

    rerender(<CommitFileListHeader {...baseProps({ showExpandCollapseAll: true })} />)
    expect(screen.getByText('Expand All')).toBeInTheDocument()

    rerender(
      <CommitFileListHeader
        {...baseProps({ showExpandCollapseAll: true, expandCollapseButtonState: 'collapse' })}
      />
    )
    expect(screen.getByText('Collapse All')).toBeInTheDocument()
  })

  it('has no header testid when not collapsible', () => {
    render(<CommitFileListHeader {...baseProps()} />)
    expect(screen.queryByTestId('file-list-zone-header')).not.toBeInTheDocument()
  })

  it('calls onToggleCollapse when the collapsible header is clicked', async () => {
    const onToggleCollapse = vi.fn()
    const user = userEvent.setup()
    render(<CommitFileListHeader {...baseProps({ collapsible: true, onToggleCollapse })} />)
    await user.click(screen.getByTestId('file-list-zone-header'))
    expect(onToggleCollapse).toHaveBeenCalledOnce()
  })

  it('renders the bulk-stage button only with both onBulkStage and hoverStage, and it stops propagation', async () => {
    const onBulkStage = vi.fn()
    const onToggleCollapse = vi.fn()
    const user = userEvent.setup()
    render(
      <CommitFileListHeader
        {...baseProps({
          collapsible: true,
          hoverStage: 'add',
          onBulkStage,
          onToggleCollapse,
        })}
      />
    )
    await user.click(screen.getByTestId('file-list-bulk-stage'))
    expect(onBulkStage).toHaveBeenCalledOnce()
    expect(onToggleCollapse).not.toHaveBeenCalled()
  })

  it('does not render the bulk-stage button without hoverStage', () => {
    render(<CommitFileListHeader {...baseProps({ onBulkStage: vi.fn() })} />)
    expect(screen.queryByTestId('file-list-bulk-stage')).not.toBeInTheDocument()
  })
})
