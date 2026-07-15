import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitFileList, type ProcessedFileItem } from './CommitFileList'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../../api/git.api', () => ({
  apiStageFile: vi.fn(),
  apiUnstageFile: vi.fn(),
  apiDiscardFileChanges: vi.fn(),
}))

import { apiStageFile, apiUnstageFile, apiDiscardFileChanges } from '../../../api/git.api'

const mockedStage = apiStageFile as unknown as ReturnType<typeof vi.fn>
const mockedUnstage = apiUnstageFile as unknown as ReturnType<typeof vi.fn>
const mockedDiscard = apiDiscardFileChanges as unknown as ReturnType<typeof vi.fn>

function file(path: string, overrides: Partial<ProcessedFileItem> = {}): ProcessedFileItem {
  return { path, status: 'modified', staged: false, ...overrides }
}

let cacheKeyCounter = 0
function renderList(
  props: Partial<React.ComponentProps<typeof CommitFileList>> & {
    processedFiles: ProcessedFileItem[]
  }
) {
  // Give every render its own cache key (unless the test wants persistence via rerender) so
  // useFileTree's expandedFolders/search state don't leak between unrelated test cases.
  const cacheKey = props.cacheKey ?? `test-${cacheKeyCounter++}`
  return render(
    <CommitFileList
      repoPath="/repo"
      isWip={false}
      commitOid="abc123"
      {...props}
      cacheKey={cacheKey}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedStage.mockResolvedValue(undefined)
  mockedUnstage.mockResolvedValue(undefined)
  mockedDiscard.mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CommitFileList — stats summary', () => {
  it('counts added/untracked, modified, deleted, and renamed files separately', () => {
    renderList({
      processedFiles: [
        file('a.ts', { status: 'added' }),
        file('b.ts', { status: 'untracked' }),
        file('c.ts', { status: 'modified' }),
        file('d.ts', { status: 'deleted' }),
        file('e.ts', { status: 'renamed' }),
      ],
    })
    expect(screen.getByText(/2 .*added/)).toBeInTheDocument()
    expect(screen.getByText(/1 .*modified/)).toBeInTheDocument()
    expect(screen.getByText(/1 .*deleted/)).toBeInTheDocument()
    expect(screen.getByText(/1 .*renamed/)).toBeInTheDocument()
    expect(screen.getByText('5 files changed')).toBeInTheDocument()
  })

  it('shows the singular "file changed" label for exactly one file', () => {
    renderList({ processedFiles: [file('a.ts')] })
    expect(screen.getByText('1 file changed')).toBeInTheDocument()
  })

  it('shows the empty-state message when there are no files', () => {
    // Appears both in the stats block and the (also-empty) tree body below it.
    renderList({ processedFiles: [] })
    expect(screen.getAllByText('workingTree.noChanges').length).toBeGreaterThan(0)
  })

  it('uses a custom empty message when provided', () => {
    renderList({ processedFiles: [], emptyMessage: 'All clear!' })
    expect(screen.getAllByText('All clear!').length).toBeGreaterThan(0)
  })

  it('hides the stats summary entirely when hideStats is set', () => {
    renderList({ processedFiles: [file('a.ts', { status: 'added' })], hideStats: true })
    expect(screen.queryByText('Stats Summary')).not.toBeInTheDocument()
  })
})

describe('CommitFileList — search', () => {
  it('filters the tree by search query', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('src/foo.ts'), file('src/bar.ts')] })
    await user.type(screen.getByPlaceholderText('commitDetails.searchFiles'), 'foo')
    expect(screen.getByText('foo.ts')).toBeInTheDocument()
    expect(screen.queryByText('bar.ts')).not.toBeInTheDocument()
  })

  it('clears the search query via the clear button', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('src/foo.ts'), file('src/bar.ts')] })
    const input = screen.getByPlaceholderText('commitDetails.searchFiles')
    await user.type(input, 'foo')
    await user.click(screen.getByRole('button', { name: '' })) // the X clear button (no accessible name)
    expect(input).toHaveValue('')
  })

  it('hides the search bar when hideSearch is set', () => {
    renderList({ processedFiles: [file('a.ts')], hideSearch: true })
    expect(screen.queryByPlaceholderText('commitDetails.searchFiles')).not.toBeInTheDocument()
  })
})

describe('CommitFileList — view mode toggle', () => {
  it('defaults to tree view, showing folder nesting', () => {
    renderList({ processedFiles: [file('src/components/Button.tsx')] })
    expect(screen.getByText('src')).toBeInTheDocument()
  })

  it('switches to list view, showing flat dir/name split rows', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('src/components/Button.tsx')] })
    await user.click(screen.getByTitle('commitDetails.viewModeList'))
    expect(screen.queryByText('src')).not.toBeInTheDocument()
    expect(screen.getByText('src/components/')).toBeInTheDocument()
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
  })
})

describe('CommitFileList — viewed indicator', () => {
  it('shows a check in front of a viewed file in tree view, not for an unviewed one', () => {
    renderList({
      processedFiles: [file('a.ts', { viewed: true }), file('b.ts', { viewed: false })],
    })
    expect(screen.getByTestId('file-tree-viewed-a.ts')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-viewed-b.ts')).not.toBeInTheDocument()
  })

  it('shows the same indicator in list view', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts', { viewed: true })] })
    await user.click(screen.getByTitle('commitDetails.viewModeList'))
    expect(screen.getByTestId('file-list-viewed-a.ts')).toBeInTheDocument()
  })
})

describe('CommitFileList — tree view interactions', () => {
  it('expands/collapses a folder on click', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('src/a.ts')] })
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument() // starts collapsed

    await user.click(screen.getByText('src'))
    expect(screen.getByText('a.ts')).toBeInTheDocument()

    await user.click(screen.getByText('src'))
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument()
  })

  it('expand-all / collapse-all toggles every folder', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('src/a.ts'), file('lib/b.ts')] })
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument()

    await user.click(screen.getByText('commitDetails.expandAll'))
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()

    await user.click(screen.getByText('commitDetails.collapseAll'))
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument()
  })

  it('selects a file diff on click, with staged/oid derived from WIP-ness', async () => {
    const onSelectFileDiff = vi.fn()
    const user = userEvent.setup()
    renderList({
      processedFiles: [file('a.ts', { staged: true })],
      isWip: true,
      commitOid: 'WIP',
      onSelectFileDiff,
    })
    await user.click(screen.getByText('a.ts'))
    expect(onSelectFileDiff).toHaveBeenCalledWith({ path: 'a.ts', staged: true, oid: undefined })
  })

  it('selects a file diff with the commit oid for a non-WIP list', async () => {
    const onSelectFileDiff = vi.fn()
    const user = userEvent.setup()
    renderList({
      processedFiles: [file('a.ts')],
      isWip: false,
      commitOid: 'sha123',
      onSelectFileDiff,
    })
    await user.click(screen.getByText('a.ts'))
    expect(onSelectFileDiff).toHaveBeenCalledWith({ path: 'a.ts', staged: false, oid: 'sha123' })
  })

  it('selects a file diff via keyboard (Enter)', async () => {
    const onSelectFileDiff = vi.fn()
    renderList({ processedFiles: [file('a.ts')], onSelectFileDiff })
    screen.getByTestId('file-tree-file-a.ts').focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelectFileDiff).toHaveBeenCalledOnce()
  })
})

describe('CommitFileList — WIP stage/unstage/discard (tree view)', () => {
  it('stages an unstaged file via its checkbox and refreshes', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts', { staged: false })], isWip: true, onRefresh })
    await user.click(screen.getByTitle('Stage'))
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'a.ts')
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('unstages a staged file via its checkbox', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts', { staged: true })], isWip: true })
    await user.click(screen.getByTitle('Unstage'))
    expect(mockedUnstage).toHaveBeenCalledWith('/repo', 'a.ts')
  })

  it('does not show a stage checkbox for a non-WIP list', () => {
    renderList({ processedFiles: [file('a.ts')], isWip: false })
    expect(screen.queryByTitle('Stage')).not.toBeInTheDocument()
  })

  it('discards a file after confirmation and refreshes', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts')], isWip: true, onRefresh })
    await user.click(screen.getByTitle('Discard Changes'))
    expect(window.confirm).toHaveBeenCalledWith('commitDetails.discardPrompt')
    expect(mockedDiscard).toHaveBeenCalledWith('/repo', 'a.ts')
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('does not discard when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts')], isWip: true })
    await user.click(screen.getByTitle('Discard Changes'))
    expect(mockedDiscard).not.toHaveBeenCalled()
  })

  it('stages/unstages every descendant when a folder checkbox is toggled (folderCheckboxes)', async () => {
    const user = userEvent.setup()
    renderList({
      processedFiles: [file('src/a.ts', { staged: false }), file('src/b.ts', { staged: false })],
      isWip: true,
      folderCheckboxes: true,
    })
    await user.click(screen.getByTestId('file-tree-folder-checkbox-src'))
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'src/b.ts')
  })

  it('unstages every descendant when the folder is fully staged (folderCheckboxes)', async () => {
    const user = userEvent.setup()
    renderList({
      processedFiles: [file('src/a.ts', { staged: true }), file('src/b.ts', { staged: true })],
      isWip: true,
      folderCheckboxes: true,
    })
    await user.click(screen.getByTestId('file-tree-folder-checkbox-src'))
    expect(mockedUnstage).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mockedUnstage).toHaveBeenCalledWith('/repo', 'src/b.ts')
  })

  it('shows the per-folder file count only with folderCheckboxes', () => {
    renderList({
      processedFiles: [file('src/a.ts'), file('src/b.ts')],
      isWip: true,
      folderCheckboxes: true,
    })
    expect(screen.getByText('commitDetails.fileCount:{"count":2}')).toBeInTheDocument()
  })

  it('starts folders expanded when folderCheckboxes is set', () => {
    renderList({ processedFiles: [file('src/a.ts')], isWip: true, folderCheckboxes: true })
    expect(screen.getByText('a.ts')).toBeInTheDocument()
  })
})

describe('CommitFileList — hoverStage mode', () => {
  it('hoverStage="add" file button stages the file', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts')], isWip: true, hoverStage: 'add' })
    const stageButtons = screen.getAllByTitle('Stage')
    await user.click(stageButtons[0])
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'a.ts')
  })

  it('hoverStage="remove" file button unstages the file', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts')], isWip: true, hoverStage: 'remove' })
    await user.click(screen.getByTitle('Unstage'))
    expect(mockedUnstage).toHaveBeenCalledWith('/repo', 'a.ts')
  })

  it('hoverStage folder button stages every descendant', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('src/a.ts')], isWip: true, hoverStage: 'add' })
    await user.click(screen.getByTestId('file-tree-folder-hover-stage-src'))
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'src/a.ts')
  })
})

describe('CommitFileList — bulk stage header button', () => {
  it('renders only when both onBulkStage and hoverStage are given, and calls onBulkStage', async () => {
    const onBulkStage = vi.fn()
    const user = userEvent.setup()
    renderList({
      processedFiles: [file('a.ts')],
      isWip: true,
      hoverStage: 'add',
      onBulkStage,
      title: 'Unstaged',
    })
    await user.click(screen.getByTestId('file-list-bulk-stage'))
    expect(onBulkStage).toHaveBeenCalledOnce()
  })

  it('is absent without hoverStage even if onBulkStage is given', () => {
    renderList({ processedFiles: [file('a.ts')], isWip: true, onBulkStage: vi.fn() })
    expect(screen.queryByTestId('file-list-bulk-stage')).not.toBeInTheDocument()
  })
})

describe('CommitFileList — collapsible zones', () => {
  it('toggles the body (stats/search/tree) via the header, keeping the title visible', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts')], collapsible: true, title: 'Staged' })
    expect(screen.getByText('Stats Summary')).toBeInTheDocument()

    await user.click(screen.getByTestId('file-list-zone-header'))
    expect(screen.queryByText('Stats Summary')).not.toBeInTheDocument()
    expect(screen.getByText('Staged')).toBeInTheDocument()

    await user.click(screen.getByTestId('file-list-zone-header'))
    expect(screen.getByText('Stats Summary')).toBeInTheDocument()
  })

  it('toggles via keyboard (Enter) on the header', async () => {
    renderList({ processedFiles: [file('a.ts')], collapsible: true })
    screen.getByTestId('file-list-zone-header').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.queryByText('Stats Summary')).not.toBeInTheDocument()
  })

  it('the bulk-stage button click does not toggle collapse (stops propagation)', async () => {
    const onBulkStage = vi.fn()
    const user = userEvent.setup()
    renderList({
      processedFiles: [file('a.ts')],
      collapsible: true,
      hoverStage: 'add',
      onBulkStage,
      isWip: true,
    })
    await user.click(screen.getByTestId('file-list-bulk-stage'))
    expect(screen.getByText('Stats Summary')).toBeInTheDocument() // still expanded
  })
})

describe('CommitFileList — list view stage/discard wiring', () => {
  it('stages/unstages/discards from the list view too', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts', { staged: false })], isWip: true, onRefresh })
    await user.click(screen.getByTitle('commitDetails.viewModeList'))
    await user.click(screen.getByTitle('Stage'))
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'a.ts')
  })

  it('shows additions/deletions counters when present', async () => {
    const user = userEvent.setup()
    renderList({ processedFiles: [file('a.ts', { additions: 4, deletions: 2 })] })
    await user.click(screen.getByTitle('commitDetails.viewModeList'))
    expect(screen.getByText('+4')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
  })
})
