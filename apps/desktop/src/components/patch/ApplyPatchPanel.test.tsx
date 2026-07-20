import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${o.count}` : k) }),
}))
vi.mock('../../api/git.api', () => ({ apiApplyPatch: vi.fn(), apiReadPatchFile: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
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

import { apiApplyPatch, apiReadPatchFile } from '../../api/git.api'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { ApplyPatchPanel } from './ApplyPatchPanel'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'

const mockedApply = apiApplyPatch as unknown as ReturnType<typeof vi.fn>
const mockedRead = apiReadPatchFile as unknown as ReturnType<typeof vi.fn>
const mockedOpen = openDialog as unknown as ReturnType<typeof vi.fn>

const PATCH = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new'

beforeEach(() => {
  vi.clearAllMocks()
  usePatchWorkspaceStore.getState().open('apply')
  mockedRead.mockResolvedValue(PATCH)
})
afterEach(() => vi.restoreAllMocks())

describe('ApplyPatchPanel', () => {
  it('parses a chosen patch into the file list and previews the first file with reconstructed sides', async () => {
    mockedOpen.mockResolvedValue('/some.patch')
    mockedApply.mockResolvedValue(undefined)
    render(<ApplyPatchPanel repoPath="/repo" />)

    fireEvent.click(screen.getByTestId('patch-choose-file'))
    await waitFor(() => expect(screen.getByTestId('file-a.ts')).toBeInTheDocument())
    expect(mockedApply).toHaveBeenCalledWith('/repo', '/some.patch', true)
    expect(usePatchWorkspaceStore.getState().activeFile).toEqual({
      path: 'a.ts',
      original: 'old',
      modified: 'new',
    })
  })

  it('applies the patch and closes', async () => {
    mockedOpen.mockResolvedValue('/some.patch')
    mockedApply.mockResolvedValue(undefined)
    render(<ApplyPatchPanel repoPath="/repo" />)
    fireEvent.click(screen.getByTestId('patch-choose-file'))
    await waitFor(() => expect(screen.getByTestId('file-a.ts')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('patch-apply-confirm'))
    await waitFor(() => expect(mockedApply).toHaveBeenCalledWith('/repo', '/some.patch', false))
    await waitFor(() => expect(usePatchWorkspaceStore.getState().mode).toBeNull())
  })

  it('surfaces a failed dry-run and blocks applying', async () => {
    mockedOpen.mockResolvedValue('/bad.patch')
    mockedApply.mockRejectedValueOnce('does not apply')
    render(<ApplyPatchPanel repoPath="/repo" />)
    fireEvent.click(screen.getByTestId('patch-choose-file'))
    await waitFor(() => expect(screen.getByTestId('patch-check-error')).toBeInTheDocument())
    expect(screen.getByTestId('patch-apply-confirm')).toBeDisabled()
  })
})
