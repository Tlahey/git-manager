import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilesToolbar } from './FilesToolbar'
import { useFileExplorerStore } from '../stores/fileExplorer.store'

const INITIAL = useFileExplorerStore.getState()

beforeEach(() => {
  useFileExplorerStore.setState(INITIAL, true)
})

describe('FilesToolbar', () => {
  it('writes the tree filter the sidebar reads', async () => {
    const user = userEvent.setup()
    render(<FilesToolbar />)

    await user.type(screen.getByTestId('file-tree-search-input'), 'Button')

    expect(useFileExplorerStore.getState().treeSearchQuery).toBe('Button')
  })

  /** The search used to live inside the tree panel, so folding the panel away took the search with
   * it. Here it stays whether the tree is showing or not. */
  it('keeps the search box while the tree is folded away', () => {
    useFileExplorerStore.setState({ isSidebarOpen: false })
    render(<FilesToolbar />)

    expect(screen.getByTestId('file-tree-search-input')).toBeInTheDocument()
  })

  it('folds the tree away and back', async () => {
    const user = userEvent.setup()
    render(<FilesToolbar />)

    await user.click(screen.getByTestId('file-explorer-toggle-sidebar'))
    expect(useFileExplorerStore.getState().isSidebarOpen).toBe(false)

    await user.click(screen.getByTestId('file-explorer-toggle-sidebar'))
    expect(useFileExplorerStore.getState().isSidebarOpen).toBe(true)
  })

  /** Closing the *view* is switching tab now, so the only close left is the one that goes back from
   * a file to the directory listing — and it only exists while a file is open. */
  it('offers to close the open file, and nothing to close when none is', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FilesToolbar />)
    expect(screen.queryByTestId('file-explorer-close-file')).not.toBeInTheDocument()

    useFileExplorerStore.getState().actions.setSelectedFilePath('src/index.ts')
    rerender(<FilesToolbar />)

    await user.click(screen.getByTestId('file-explorer-close-file'))
    expect(useFileExplorerStore.getState().selectedFilePath).toBeNull()
  })
})
