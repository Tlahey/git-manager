import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useRepoFiles, useGitStatus, lastDiffProps } = vi.hoisted(() => ({
  useRepoFiles: vi.fn(),
  useGitStatus: vi.fn(),
  lastDiffProps: { current: null as unknown },
}))
vi.mock('../../hooks/useRepoFiles', () => ({ useRepoFiles }))
vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus }))
vi.mock('../git-graph/DiffViewCenter', () => ({
  DiffViewCenter: (props: Record<string, unknown>) => {
    lastDiffProps.current = props
    return <div data-testid="diff-view-center" />
  },
}))
vi.mock('../terminal/TerminalPanel', () => ({ TerminalPanel: () => <div /> }))
vi.mock('../terminal/TerminalStatusBar', () => ({ TerminalStatusBar: () => <div /> }))
vi.mock('../../stores/repoUI.store', () => ({
  useRepoUIStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        activeRepo: '/repo',
        activeWorkspacePath: null,
        setActiveDiffFile: vi.fn(),
      }
      return selector ? selector(state) : state
    },
    { getState: () => ({}) }
  ),
}))

import { ProjectFilesView } from './ProjectFilesView'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'

const initialExplorerState = useFileExplorerStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useFileExplorerStore.setState(initialExplorerState, true)
  useRepoFiles.mockReturnValue({
    data: ['src/index.ts', 'docs/guide.md', 'logo.png'],
    isLoading: false,
  })
  useGitStatus.mockReturnValue({ data: { staged: [], unstaged: [], untracked: [], conflicted: [] } })
})

describe('ProjectFilesView — directory listing', () => {
  it('lists the repository root, directories first', () => {
    render(<ProjectFilesView />)

    expect(screen.getByTestId('file-row-docs')).toBeInTheDocument()
    expect(screen.getByTestId('file-row-src')).toBeInTheDocument()
    expect(screen.getByTestId('file-row-logo.png')).toBeInTheDocument()
  })

  it('navigates into a directory and back out through the breadcrumb', async () => {
    const user = userEvent.setup()
    render(<ProjectFilesView />)

    await user.click(screen.getByTestId('file-row-src'))
    expect(useFileExplorerStore.getState().currentDirPath).toBe('src')
    expect(screen.getByTestId('file-row-src/index.ts')).toBeInTheDocument()

    await user.click(screen.getByTestId('file-breadcrumb-root'))
    expect(useFileExplorerStore.getState().currentDirPath).toBe('')
  })

  it('says so when a directory has nothing left in it', () => {
    useRepoFiles.mockReturnValue({ data: [], isLoading: false })
    render(<ProjectFilesView />)

    expect(screen.getByText('This directory is empty.')).toBeInTheDocument()
  })
})

describe('ProjectFilesView — opening a file', () => {
  it('opens a source file on its contents', async () => {
    const user = userEvent.setup()
    render(<ProjectFilesView />)

    await user.click(screen.getByTestId('file-row-src'))
    await user.click(screen.getByTestId('file-row-src/index.ts'))

    expect(screen.getByTestId('diff-view-center')).toBeInTheDocument()
    expect(lastDiffProps.current).toMatchObject({
      repoPath: '/repo',
      file: { path: 'src/index.ts', initialTab: 'file' },
    })
  })

  it('opens an image straight on its preview, where a diff and a blame say nothing', async () => {
    const user = userEvent.setup()
    render(<ProjectFilesView />)

    await user.click(screen.getByTestId('file-row-logo.png'))

    expect(lastDiffProps.current).toMatchObject({
      file: { path: 'logo.png', initialTab: 'preview' },
    })
  })

  it('flags a file with no pending change, so the viewer can say why the diff is empty', async () => {
    const user = userEvent.setup()
    render(<ProjectFilesView />)

    await user.click(screen.getByTestId('file-row-logo.png'))

    expect(lastDiffProps.current).toMatchObject({ file: { unmodified: true, staged: false } })
  })

  it('marks a staged-only file as staged, so the viewer diffs the index', async () => {
    useGitStatus.mockReturnValue({
      data: {
        staged: [{ path: 'logo.png', status: 'modified' }],
        unstaged: [],
        untracked: [],
        conflicted: [],
      },
    })
    const user = userEvent.setup()
    render(<ProjectFilesView />)

    await user.click(screen.getByTestId('file-row-logo.png'))

    expect(lastDiffProps.current).toMatchObject({ file: { staged: true, unmodified: false } })
  })

  it('shows the working-tree version of a file that is both staged and modified again', async () => {
    useGitStatus.mockReturnValue({
      data: {
        staged: [{ path: 'logo.png', status: 'modified' }],
        unstaged: [{ path: 'logo.png', status: 'modified' }],
        untracked: [],
        conflicted: [],
      },
    })
    const user = userEvent.setup()
    render(<ProjectFilesView />)

    await user.click(screen.getByTestId('file-row-logo.png'))

    expect(lastDiffProps.current).toMatchObject({ file: { staged: false, unmodified: false } })
  })
})
