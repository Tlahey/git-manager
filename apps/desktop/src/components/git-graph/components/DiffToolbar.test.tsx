import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitDiffFile } from '@git-manager/git-types'
import { DiffToolbar } from './DiffToolbar'

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
  }
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

  it('renders the path at readable contrast (not the faint /60 muted variant)', () => {
    // Twilight a11y regression: the dir line was text-muted-foreground/60, a faint
    // gray on the light bg-card. It must use the full-opacity muted token.
    render(<DiffToolbar {...baseProps()} />)
    const path = screen.getByTestId('diff-header-path')
    expect(path.className).toContain('text-muted-foreground')
    expect(path.className).not.toMatch(/text-muted-foreground\/\d/)
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
    expect(screen.getByTestId('diff-additions')).toHaveTextContent('+10')
    expect(screen.getByTestId('diff-deletions')).toHaveTextContent('-2')
  })

  it('renders the counts as toned Tags, not raw green/red text the themes cannot grade', () => {
    render(<DiffToolbar {...baseProps({ diffData: diffFile({ additions: 10, deletions: 2 }) })} />)

    expect(screen.getByTestId('diff-additions')).toHaveClass('text-tone-success')
    expect(screen.getByTestId('diff-deletions')).toHaveClass('text-tone-danger')
    expect(screen.getByTestId('diff-additions')).not.toHaveClass('text-green-500')
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

  it('gives Preview and Blame distinct icons, since folding leaves nothing but the icon to go on', () => {
    render(<DiffToolbar {...baseProps({ hasPreview: true })} />)

    const previewIcon = screen.getByTestId('diff-tab-preview').querySelector('svg')
    const blameIcon = screen.getByTestId('diff-blame-toggle').querySelector('svg')

    expect(previewIcon?.getAttribute('class')).toBeTruthy()
    expect(previewIcon?.getAttribute('class')).not.toBe(blameIcon?.getAttribute('class'))
  })

  it('offers no Preview tab for a file that cannot be previewed', () => {
    render(<DiffToolbar {...baseProps()} />)
    expect(screen.queryByTestId('diff-tab-preview')).not.toBeInTheDocument()
  })

  it('keeps Diff and File alongside Preview, so an image or SVG is never left on a tab it cannot leave', async () => {
    const onChangeActiveTab = vi.fn()
    const user = userEvent.setup()
    render(
      <DiffToolbar
        {...baseProps({
          hasPreview: true,
          activeTab: 'preview',
          file: { path: 'docs/logo.svg', staged: false },
          onChangeActiveTab,
        })}
      />
    )

    expect(screen.getByTestId('diff-tab-diff')).toBeInTheDocument()
    expect(screen.getByTestId('diff-tab-file')).toBeInTheDocument()

    await user.click(screen.getByTestId('diff-tab-diff'))
    expect(onChangeActiveTab).toHaveBeenCalledWith('diff')
  })
})

/**
 * Whether a label is actually on screen is decided by a container query in `diffToolbar.css`, which
 * jsdom does not evaluate — these cases pin down the contract that stylesheet hooks into, and the
 * guarantee that folding a label costs nothing: the control keeps its name and its tooltip.
 */
describe('DiffToolbar — folding contract with diffToolbar.css', () => {
  it('declares the query container on the toolbar itself', () => {
    const { container } = render(<DiffToolbar {...baseProps()} />)
    expect(container.querySelector('.diff-toolbar')).not.toBeNull()
  })

  it('marks every foldable label with the class the container query targets', () => {
    render(<DiffToolbar {...baseProps({ diffData: diffFile(), isWip: true, hasPreview: true })} />)

    for (const testId of ['diff-tab-diff', 'diff-tab-file', 'diff-tab-preview']) {
      expect(screen.getByTestId(testId).querySelector('.diff-toolbar-tab-label')).not.toBeNull()
    }
    for (const testId of [
      'diff-blame-toggle',
      'diff-history-toggle',
      'diff-stage-toggle',
      'diff-discard',
    ]) {
      expect(screen.getByTestId(testId).querySelector('.diff-toolbar-action-label')).not.toBeNull()
    }
  })

  it('names every control independently of its label being displayed', () => {
    // A hidden label leaves no accessible name behind, so each control carries its own aria-label.
    render(<DiffToolbar {...baseProps({ diffData: diffFile(), isWip: true, hasPreview: true })} />)

    expect(screen.getByRole('button', { name: 'Diff' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blame' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stage File' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })

  it('clips the file identity rather than letting it run over the tabs', () => {
    const { container } = render(<DiffToolbar {...baseProps({ diffData: diffFile() })} />)

    // The path column is the only one allowed to shrink; without clipping, its badges keep their
    // intrinsic width and paint over the neighbouring clusters.
    const identity = container.querySelector('.diff-toolbar > div')
    expect(identity?.className).toContain('overflow-hidden')
    expect(identity?.className).toMatch(/min-w-\[/)
  })
})

describe('DiffToolbar — blame/history panel toggle', () => {
  it('activates blame, then toggles it back off when clicked again', async () => {
    const onChangeActiveLeftPanel = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveLeftPanel, activeLeftPanel: 'sidebar' })} />)
    await user.click(screen.getByTestId('diff-blame-toggle'))
    expect(onChangeActiveLeftPanel).toHaveBeenCalledWith('blame')
  })

  it('toggles blame back to sidebar when already active', async () => {
    const onChangeActiveLeftPanel = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveLeftPanel, activeLeftPanel: 'blame' })} />)
    await user.click(screen.getByTestId('diff-blame-toggle'))
    expect(onChangeActiveLeftPanel).toHaveBeenCalledWith('sidebar')
  })

  it('activates history', async () => {
    const onChangeActiveLeftPanel = vi.fn()
    const user = userEvent.setup()
    render(<DiffToolbar {...baseProps({ onChangeActiveLeftPanel, activeLeftPanel: 'sidebar' })} />)
    await user.click(screen.getByTestId('diff-history-toggle'))
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
    await user.click(screen.getByRole('button', { name: 'Back to graph' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
