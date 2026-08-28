import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitFileListRow } from './CommitFileListRow'
import type { ProcessedFileItem } from './CommitFileList'
import type { FileTreeRowContext } from './fileTreeRowContext'

function file(overrides: Partial<ProcessedFileItem> = {}): ProcessedFileItem {
  return { path: 'src/foo.ts', status: 'modified', staged: false, ...overrides }
}

function ctx(overrides: Partial<FileTreeRowContext> = {}): FileTreeRowContext {
  return {
    isWip: false,
    commitOid: 'abc123',
    expandedFolders: new Set(),
    toggleFolder: vi.fn(),
    onStage: vi.fn(),
    onUnstage: vi.fn(),
    onDiscard: vi.fn(),
    onToggleFolderStage: vi.fn(),
    onHoverStageFolder: vi.fn(),
    ...overrides,
  }
}

describe('CommitFileListRow', () => {
  it('shows the full path via FilePathLabel', () => {
    render(<CommitFileListRow file={file({ path: 'src/components/foo.ts' })} ctx={ctx()} />)
    expect(screen.getByText('src/components/')).toBeInTheDocument()
    expect(screen.getByText('foo.ts')).toBeInTheDocument()
  })

  it('selects the file diff on click, with staged/oid derived from WIP-ness', async () => {
    const onSelectFileDiff = vi.fn()
    const user = userEvent.setup()
    render(
      <CommitFileListRow
        file={file({ staged: true })}
        ctx={ctx({ isWip: true, commitOid: 'WIP', onSelectFileDiff })}
      />
    )
    await user.click(screen.getByText('foo.ts'))
    expect(onSelectFileDiff).toHaveBeenCalledWith({
      path: 'src/foo.ts',
      staged: true,
      oid: undefined,
    })
  })

  it('shows a stage checkbox for a WIP list and toggles it', async () => {
    const onStage = vi.fn()
    const user = userEvent.setup()
    render(<CommitFileListRow file={file({ staged: false })} ctx={ctx({ isWip: true, onStage })} />)
    await user.click(screen.getByLabelText('Stage'))
    expect(onStage).toHaveBeenCalledWith('src/foo.ts')
  })

  it('does not show a stage checkbox for a non-WIP list', () => {
    render(<CommitFileListRow file={file()} ctx={ctx({ isWip: false })} />)
    expect(screen.queryByLabelText('Stage')).not.toBeInTheDocument()
  })

  it('shows the viewed indicator when the file is viewed', () => {
    render(<CommitFileListRow file={file({ viewed: true })} ctx={ctx()} />)
    expect(screen.getByTestId('file-list-viewed-src/foo.ts')).toBeInTheDocument()
  })

  it('shows additions/deletions counters when present', () => {
    render(<CommitFileListRow file={file({ additions: 4, deletions: 2 })} ctx={ctx()} />)
    expect(screen.getByText('+4')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('discards the file via its button (WIP)', async () => {
    const onDiscard = vi.fn()
    const user = userEvent.setup()
    render(<CommitFileListRow file={file()} ctx={ctx({ isWip: true, onDiscard })} />)
    await user.click(screen.getByLabelText('Discard Changes'))
    expect(onDiscard).toHaveBeenCalledWith('src/foo.ts')
  })
})
