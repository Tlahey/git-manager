import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useRepoFiles } = vi.hoisted(() => ({ useRepoFiles: vi.fn() }))
vi.mock('../../hooks/useRepoFiles', () => ({ useRepoFiles }))
vi.mock('../../stores/repoUI.store', () => ({
  useRepoUIStore: () => ({ activeRepo: '/repo', activeWorkspacePath: null }),
}))

import { FileTreeSidebar } from './FileTreeSidebar'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'

const initialExplorerState = useFileExplorerStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useFileExplorerStore.setState(initialExplorerState, true)
  useRepoFiles.mockReturnValue({
    data: ['src/components/Button.tsx', 'src/index.ts', 'README.md'],
    isLoading: false,
  })
})

describe('FileTreeSidebar', () => {
  it('lists the repository roots, directories first, with nested files folded away', () => {
    render(<FileTreeSidebar />)

    expect(screen.getByTestId('file-tree-node-src')).toBeInTheDocument()
    expect(screen.getByTestId('file-tree-node-README.md')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-node-src/index.ts')).not.toBeInTheDocument()
  })

  it('unfolds a directory when it is clicked', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.click(screen.getByTestId('file-tree-node-src'))

    expect(screen.getByTestId('file-tree-node-src/index.ts')).toBeInTheDocument()
    expect(screen.getByTestId('file-tree-node-src')).toHaveAttribute('aria-expanded', 'true')
  })

  it('selects a file, which is what the diff viewer reads', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.click(screen.getByTestId('file-tree-node-README.md'))

    expect(useFileExplorerStore.getState().selectedFilePath).toBe('README.md')
  })

  it('shows search matches expanded, instead of behind folders the user must open', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.type(screen.getByTestId('file-tree-search-input'), 'Button')

    // The match itself is on screen, not just the `src` folder that contains it.
    expect(screen.getByTestId('file-tree-node-src/components/Button.tsx')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-node-README.md')).not.toBeInTheDocument()
  })

  it('tells the user when a search matches nothing', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.type(screen.getByTestId('file-tree-search-input'), 'zzz')

    expect(screen.getByText('No files found')).toBeInTheDocument()
  })

  it('hides itself through the store when the collapse button is used', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.click(screen.getByTestId('file-tree-hide-sidebar'))

    expect(useFileExplorerStore.getState().isSidebarOpen).toBe(false)
  })
})
