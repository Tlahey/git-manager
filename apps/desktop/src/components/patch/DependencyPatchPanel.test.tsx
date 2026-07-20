import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${o.count}` : k) }),
}))
vi.mock('../../api/git.api', () => ({
  apiListPatchableDependencies: vi.fn(),
  apiPrepareDependencyPatch: vi.fn(),
  apiCommitDependencyPatch: vi.fn(),
}))
vi.mock('../git-graph/components/CommitFileList', () => ({
  CommitFileList: ({
    processedFiles,
    onSelectFileDiff,
  }: {
    processedFiles: { path: string }[]
    onSelectFileDiff: (f: { path: string; staged: boolean }) => void
  }) => (
    <div data-testid="file-list">
      {processedFiles.map((f) => (
        <button key={f.path} data-testid={`file-${f.path}`} onClick={() => onSelectFileDiff({ path: f.path, staged: false })}>
          {f.path}
        </button>
      ))}
    </div>
  ),
}))

import {
  apiListPatchableDependencies,
  apiPrepareDependencyPatch,
  apiCommitDependencyPatch,
} from '../../api/git.api'
import { DependencyPatchPanel } from './DependencyPatchPanel'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'

const mockedList = apiListPatchableDependencies as unknown as ReturnType<typeof vi.fn>
const mockedPrepare = apiPrepareDependencyPatch as unknown as ReturnType<typeof vi.fn>
const mockedCommit = apiCommitDependencyPatch as unknown as ReturnType<typeof vi.fn>

const DEP_DIFF = 'diff --git a/index.js b/index.js\n--- a/index.js\n+++ b/index.js\n@@ -1 +1 @@\n-a\n+b'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DependencyPatchPanel repoPath="/repo" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  usePatchWorkspaceStore.getState().open('dependency')
  mockedList.mockResolvedValue([
    { name: 'is-odd', version: '3.0.1', installed: true, patched: false },
    { name: 'ghost', version: '^1.0.0', installed: false, patched: false },
  ])
})
afterEach(() => vi.restoreAllMocks())

describe('DependencyPatchPanel', () => {
  it('prepares a dependency and lists its changed files, previewing the first', async () => {
    mockedPrepare.mockResolvedValue({ editDir: '/tmp/edit', diff: DEP_DIFF, unchanged: false })
    renderPanel()
    fireEvent.click(await screen.findByTestId('patch-dep-is-odd'))
    await waitFor(() => expect(mockedPrepare).toHaveBeenCalledWith('/repo', 'is-odd', '3.0.1'))
    expect(await screen.findByTestId('file-index.js')).toBeInTheDocument()
    expect(usePatchWorkspaceStore.getState().activeFile).toEqual({
      path: 'index.js',
      original: 'a',
      modified: 'b',
    })
  })

  it('refuses a dependency that is not installed', async () => {
    renderPanel()
    fireEvent.click(await screen.findByTestId('patch-dep-ghost'))
    await waitFor(() =>
      expect(screen.getByTestId('patch-dep-error')).toHaveTextContent('patch.dependency.notInstalled')
    )
    expect(mockedPrepare).not.toHaveBeenCalled()
  })

  it('commits the prepared patch and closes', async () => {
    mockedPrepare.mockResolvedValue({ editDir: '/tmp/edit', diff: DEP_DIFF, unchanged: false })
    mockedCommit.mockResolvedValue({ patchFile: 'patches/is-odd@3.0.1.patch', key: 'is-odd@3.0.1' })
    renderPanel()
    fireEvent.click(await screen.findByTestId('patch-dep-is-odd'))
    await screen.findByTestId('file-index.js')

    fireEvent.click(screen.getByTestId('patch-dep-confirm'))
    await waitFor(() => expect(mockedCommit).toHaveBeenCalledWith('/repo', '/tmp/edit'))
    await waitFor(() => expect(usePatchWorkspaceStore.getState().mode).toBeNull())
  })
})
