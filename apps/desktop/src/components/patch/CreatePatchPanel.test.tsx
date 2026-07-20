import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${o.count}` : k),
  }),
}))
vi.mock('../../api/git.api', () => ({
  apiCreateWorkingPatch: vi.fn(),
  apiStageAll: vi.fn(),
  apiUnstageAll: vi.fn(),
}))
vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }))
vi.mock('../git-graph/components/CommitFileList', () => ({
  CommitFileList: ({
    title,
    processedFiles,
    onSelectFileDiff,
  }: {
    title: string
    processedFiles: { path: string }[]
    onSelectFileDiff: (f: { path: string; staged: boolean }) => void
  }) => (
    <div data-testid={`zone-${title}`}>
      {processedFiles.map((f) => (
        <button key={f.path} data-testid={`file-${f.path}`} onClick={() => onSelectFileDiff({ path: f.path, staged: false })}>
          {f.path}
        </button>
      ))}
    </div>
  ),
}))

import { apiCreateWorkingPatch } from '../../api/git.api'
import { useGitStatus } from '../../hooks/useGitStatus'
import { save } from '@tauri-apps/plugin-dialog'
import { CreatePatchPanel } from './CreatePatchPanel'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'

const mockedCreate = apiCreateWorkingPatch as unknown as ReturnType<typeof vi.fn>
const mockedStatus = useGitStatus as unknown as ReturnType<typeof vi.fn>
const mockedSave = save as unknown as ReturnType<typeof vi.fn>

function renderPanel() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <CreatePatchPanel repoPath="/repo" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  usePatchWorkspaceStore.getState().open('create')
  mockedCreate.mockResolvedValue(undefined)
  mockedStatus.mockReturnValue({
    data: {
      staged: [{ path: 'a.ts', status: 'modified' }],
      unstaged: [{ path: 'b.ts', status: 'modified' }],
      untracked: ['c.ts'],
      conflicted: [],
    },
  })
})
afterEach(() => vi.restoreAllMocks())

describe('CreatePatchPanel', () => {
  it('splits files into a Patch (staged) zone and a Files (unstaged/untracked) zone', () => {
    renderPanel()
    expect(screen.getByTestId('zone-patch.zone.patch:1')).toBeInTheDocument()
    expect(screen.getByTestId('zone-patch.zone.files:2')).toBeInTheDocument()
    expect(screen.getByTestId('file-a.ts')).toBeInTheDocument()
    expect(screen.getByTestId('file-c.ts')).toBeInTheDocument()
  })

  it('sets the active file when a row is selected', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('file-a.ts'))
    expect(usePatchWorkspaceStore.getState().activeFile).toEqual({ path: 'a.ts' })
  })

  it('creates a patch from the staged files and closes', async () => {
    mockedSave.mockResolvedValue('/out.patch')
    renderPanel()
    fireEvent.click(screen.getByTestId('patch-create-confirm'))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('/repo', ['a.ts'], '/out.patch'))
    await waitFor(() => expect(usePatchWorkspaceStore.getState().mode).toBeNull())
  })
})
