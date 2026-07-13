import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitDiffFile } from '@git-manager/git-types'
import { DiffToolbar } from './DiffToolbar'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function diffFile(overrides: Partial<GitDiffFile> = {}): GitDiffFile {
  return {
    oldPath: 'a.ts',
    newPath: 'a.ts',
    status: 'modified',
    isBinary: false,
    additions: 3,
    deletions: 1,
    hunks: [],
    ...overrides,
  } as GitDiffFile
}

function baseProps(
  overrides: Partial<React.ComponentProps<typeof DiffToolbar>> = {}
): React.ComponentProps<typeof DiffToolbar> {
  return {
    parsedPath: { dir: 'src/', name: 'a.ts' },
    diffData: undefined,
    file: { path: 'src/a.ts', staged: false },
    isWip: false,
    copied: false,
    onCopyPath: vi.fn(),
    onClose: vi.fn(),
    activeTab: 'diff',
    onChangeActiveTab: vi.fn(),
    activeLeftPanel: 'sidebar',
    onChangeActiveLeftPanel: vi.fn(),
    isProcessing: false,
    onToggleStage: vi.fn(),
    onRollback: vi.fn(),
    ...overrides,
  }
}

describe('DiffToolbar — path and copy', () => {
  it('shows the directory and file name', () => {
    render(<DiffToolbar {...baseProps()} />)
    expect(screen.getByTestId('diff-header-path')).toHaveTextContent('src/')
    expect(screen.getByTestId('diff-header-name')).toHaveTextContent('a.ts')
  })

  it('omits the directory line when there is none', () => {
    render(<DiffToolbar {...baseProps({ parsedPath: { dir: '', name: 'a.ts' } })} />)
    expect(screen.queryByTestId('diff-header-path')).not.toBeInTheDocument()
  })

  it('calls onCopyPath when the copy button is clicked, and reflects "copied" via its icon', async () => {
    const onCopyPath = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<DiffToolbar {...baseProps({ onCopyPath })} />)
    await user.click(screen.getByTestId('diff-copy-path-btn'))
    expect(onCopyPath).toHaveBeenCalledOnce()
    expect(screen.getByTestId('diff-copy-path-btn').querySelector('.lucide-copy')).toBeTruthy()

    rerender(<DiffToolbar {...baseProps({ onCopyPath, copied: true })} />)
    expect(screen.getByTestId('diff-copy-path-btn').querySelector('.lucide-check')).toBeTruthy()
  })
})

describe('DiffToolbar — status badge', () => {
  it('shows nothing status-related when there is no diff data', () => {
    render(<DiffToolbar {...baseProps({ diffData: undefined })} />)
    expect(screen.queryByText('Modified')).not.toBeInTheDocument()
  })

  it('shows the status label and +/- counts for a non-binary file', () => {
    render(
      <DiffToolbar
        {...baseProps({ diffData: diffFile({ status: 'added', additions: 10, deletions: 2 }) })}
      />
    )
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('hides the +/- counts for a binary file', () => {
    render(<DiffToolbar {...baseProps({ diffData: diffFile({ isBinary: true }) })} />)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('shows a Staged/Unstaged badge only for WIP files', () => {
    const { rerender } = render(
      <DiffToolbar
        {...baseProps({ diffData: diffFile(), isWip: true, file: { path: 'a', staged: false } })}
      />
    )
    expect(screen.getByText('Unstaged')).toBeInTheDocument()

    rerender(
      <DiffToolbar
        {...baseProps({ diffData: diffFile(), isWip: true, file: { path: 'a', staged: true } })}
      />
    )
    expect(screen.getByText('Staged')).toBeInTheDocument()

    rerender(<DiffToolbar {...baseProps({ diffData: diffFile(), isWip: false })} />)
    expect(screen.queryByText('Staged')).not.toBeInTheDocument()
    expect(screen.queryByText('Unstaged')).not.toBeInTheDocument()
  })
})

describe('DiffToolbar — tabs', () => {
  it('switches to the file tab and back to diff', async () => {
    const onChangeActiveTab = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveTab })} />)
    await user.click(screen.getByText('File'))
    expect(onChangeActiveTab).toHaveBeenCalledWith('file')
    await user.click(screen.getByText('Diff'))
    expect(onChangeActiveTab).toHaveBeenCalledWith('diff')
  })
})

describe('DiffToolbar — blame/history panel toggle', () => {
  it('activates blame, then toggles it back off when clicked again', async () => {
    const onChangeActiveLeftPanel = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveLeftPanel, activeLeftPanel: 'sidebar' })} />)
    await user.click(screen.getByTitle('Git Blame'))
    expect(onChangeActiveLeftPanel).toHaveBeenCalledWith('blame')
  })

  it('toggles blame back to sidebar when already active', async () => {
    const onChangeActiveLeftPanel = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveLeftPanel, activeLeftPanel: 'blame' })} />)
    await user.click(screen.getByTitle('Git Blame'))
    expect(onChangeActiveLeftPanel).toHaveBeenCalledWith('sidebar')
  })

  it('activates history', async () => {
    const onChangeActiveLeftPanel = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveLeftPanel, activeLeftPanel: 'sidebar' })} />)
    await user.click(screen.getByTitle('File History'))
    expect(onChangeActiveLeftPanel).toHaveBeenCalledWith('history')
  })
})

describe('DiffToolbar — WIP actions', () => {
  it('hides stage/discard actions when not WIP', () => {
    render(<DiffToolbar {...baseProps({ isWip: false, diffData: diffFile() })} />)
    expect(screen.queryByText('Discard')).not.toBeInTheDocument()
  })

  it('hides stage/discard actions when there is no diff data, even if WIP', () => {
    render(<DiffToolbar {...baseProps({ isWip: true, diffData: undefined })} />)
    expect(screen.queryByText('Discard')).not.toBeInTheDocument()
  })

  it('shows "Stage File" for an unstaged WIP file and calls onToggleStage', async () => {
    const onToggleStage = vi.fn()
    const user = userEvent.setup()
    render(
      <DiffToolbar
        {...baseProps({
          isWip: true,
          diffData: diffFile(),
          file: { path: 'a', staged: false },
          onToggleStage,
        })}
      />
    )
    await user.click(screen.getByText('Stage File'))
    expect(onToggleStage).toHaveBeenCalledOnce()
  })

  it('shows "Unstage" for a staged WIP file', () => {
    render(
      <DiffToolbar
        {...baseProps({ isWip: true, diffData: diffFile(), file: { path: 'a', staged: true } })}
      />
    )
    expect(screen.getByText('Unstage')).toBeInTheDocument()
  })

  it('calls onRollback from the Discard button', async () => {
    const onRollback = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ isWip: true, diffData: diffFile(), onRollback })} />)
    await user.click(screen.getByText('Discard'))
    expect(onRollback).toHaveBeenCalledOnce()
  })

  it('disables stage/discard while processing', () => {
    render(
      <DiffToolbar {...baseProps({ isWip: true, diffData: diffFile(), isProcessing: true })} />
    )
    expect(screen.getByText('Stage File').closest('button')).toBeDisabled()
    expect(screen.getByText('Discard').closest('button')).toBeDisabled()
  })
})

describe('DiffToolbar — close', () => {
  it('calls onClose from both the back chevron and the close (X) button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onClose })} />)
    await user.click(screen.getByTitle('Back to graph'))
    await user.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
