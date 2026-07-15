import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhPrFile } from '../../../api/github.api'
import type { ProcessedFileItem } from '../components/CommitFileList'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrFilesMock, usePrFilesViewedStateMock } = vi.hoisted(() => ({
  usePrFilesMock: vi.fn(),
  usePrFilesViewedStateMock: vi.fn(),
}))
vi.mock('../../../hooks/usePrFiles', () => ({ usePrFiles: usePrFilesMock }))
vi.mock('../../../hooks/usePrFilesViewedState', () => ({
  usePrFilesViewedState: usePrFilesViewedStateMock,
}))

// Use the shared list/tree component, but stub it here to assert the mapping + selection wiring.
vi.mock('../components/CommitFileList', () => ({
  CommitFileList: (p: {
    processedFiles: ProcessedFileItem[]
    onSelectFileDiff?: (f: { path: string; staged: boolean }) => void
  }) => (
    <div data-testid="stub-file-list">
      {p.processedFiles.map((f) => (
        <button
          key={f.path}
          data-testid={`row-${f.path}`}
          data-status={f.status}
          data-viewed={String(!!f.viewed)}
          onClick={() => p.onSelectFileDiff?.({ path: f.path, staged: false })}
        >
          {f.path}
        </button>
      ))}
    </div>
  ),
}))

import { PrFilesPanel } from './PrFilesPanel'
import { useRepoUIStore } from '../../../stores/repoUI.store'

function file(overrides: Partial<GhPrFile> = {}): GhPrFile {
  return { filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, changes: 1, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.getState().setActivePrFile(null)
  usePrFilesMock.mockReturnValue({
    files: [file(), file({ filename: 'src/b.ts', status: 'removed' })],
    isLoading: false,
  })
  usePrFilesViewedStateMock.mockReturnValue({
    pullRequestId: 'PR_node_id',
    viewedByPath: {},
    isLoading: false,
  })
})

describe('PrFilesPanel', () => {
  it('feeds the shared list/tree component with mapped file statuses', () => {
    render(<PrFilesPanel repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('stub-file-list')).toBeInTheDocument()
    expect(screen.getByTestId('row-src/a.ts')).toHaveAttribute('data-status', 'modified')
    // GitHub "removed" maps to the app's "deleted".
    expect(screen.getByTestId('row-src/b.ts')).toHaveAttribute('data-status', 'deleted')
  })

  it('selects a file into the store (drives the center diff)', async () => {
    const user = userEvent.setup()
    render(<PrFilesPanel repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('row-src/b.ts'))
    expect(useRepoUIStore.getState().activePrFile).toBe('src/b.ts')
  })

  it('shows a spinner while loading', () => {
    usePrFilesMock.mockReturnValue({ files: [], isLoading: true })
    render(<PrFilesPanel repoPath="/repo" prNumber={7} />)
    expect(screen.queryByTestId('stub-file-list')).not.toBeInTheDocument()
  })

  it('marks a file as viewed only when GitHub reports its state as VIEWED', () => {
    usePrFilesViewedStateMock.mockReturnValue({
      pullRequestId: 'PR_node_id',
      viewedByPath: { 'src/a.ts': 'VIEWED', 'src/b.ts': 'DISMISSED' },
      isLoading: false,
    })
    render(<PrFilesPanel repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('row-src/a.ts')).toHaveAttribute('data-viewed', 'true')
    expect(screen.getByTestId('row-src/b.ts')).toHaveAttribute('data-viewed', 'false')
  })
})
