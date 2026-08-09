import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilesToolbar } from './FilesToolbar'
import { useFileExplorerStore } from '../stores/fileExplorer.store'
import { useRepoViewStore } from '../../../stores/repoView.store'

const INITIAL = useFileExplorerStore.getState()

beforeEach(() => {
  useFileExplorerStore.setState(INITIAL, true)
  useRepoViewStore.setState({ isPanelOpen: true })
})

describe('FilesToolbar', () => {
  /**
   * The toolbar raises the search; the field is `FileSearchPanel`, over the listing it filters. So
   * a click here flips the store the panel reads — the toolbar carries no field of its own.
   */
  it('opens and closes the file search rather than carrying the field itself', async () => {
    const user = userEvent.setup()
    render(<FilesToolbar />)
    expect(screen.queryByTestId('file-search-panel-input')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('file-search-button'))
    expect(useFileExplorerStore.getState().isSearchOpen).toBe(true)

    await user.click(screen.getByTestId('file-search-button'))
    expect(useFileExplorerStore.getState().isSearchOpen).toBe(false)
  })

  /** The search used to live inside the tree panel, so folding the panel away took the search with
   * it. Its button is on the toolbar, which the panel cannot take with it. */
  it('keeps the search reachable while the tree is folded away', () => {
    useRepoViewStore.setState({ isPanelOpen: false })
    render(<FilesToolbar />)

    expect(screen.getByTestId('file-search-button')).toBeInTheDocument()
  })

  /**
   * Folding the tree away is not this toolbar's job any more: the panel slot is the shell's, filled
   * in turn by the branch sidebar, the file tree and the board list, so one button on the bar (and
   * ⌘S) serves all three — see `ActionToolbar`.
   */
  it('leaves the panel toggle to the toolbar shell', () => {
    render(<FilesToolbar />)
    expect(screen.queryByTestId('file-explorer-toggle-sidebar')).not.toBeInTheDocument()
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
