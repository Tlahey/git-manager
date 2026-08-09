import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useRepoFiles } = vi.hoisted(() => ({ useRepoFiles: vi.fn() }))
vi.mock('../hooks/useRepoFiles', () => ({ useRepoFiles }))
vi.mock('../../../stores/repoUI.store', () => ({
  useRepoUIStore: () => ({ activeRepo: '/repo', activeWorkspacePath: null }),
}))

import { FileTreeSidebar } from './FileTreeSidebar'
import { useFileExplorerStore } from '../stores/fileExplorer.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { useSidebarSearchStore } from '../../../stores/sidebarSearch.store'

const initialExplorerState = useFileExplorerStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useFileExplorerStore.setState(initialExplorerState, true)
  useSidebarSearchStore.setState({ focusToken: 0 })
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

  /**
   * The filter is this panel's own field, above the tree it filters — not a toolbar button and not
   * a floating panel over the listing. Both of those were tried; what settled it is that the query
   * narrows *this* tree and nothing else, so the control that writes it belongs beside it.
   */
  it('carries its own filter field, which writes the query the tree reads', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.type(screen.getByTestId('file-tree-search-input'), 'Button')

    expect(useFileExplorerStore.getState().treeSearchQuery).toBe('Button')
    expect(screen.getByTestId('file-tree-node-src/components/Button.tsx')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-node-README.md')).not.toBeInTheDocument()
  })

  it('clears the filter from the field itself', async () => {
    useFileExplorerStore.getState().actions.setTreeSearchQuery('Button')
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.click(screen.getByLabelText('Clear filter'))

    expect(useFileExplorerStore.getState().treeSearchQuery).toBe('')
  })

  /** ⌘F on this view, and ⌥⌘F anywhere, both raise the *left panel's* filter — one request, served
   * by whichever panel is in the slot. On the graph that is the branch list's field; here, this. */
  it('takes focus when the left panel’s filter is asked for', () => {
    render(<FileTreeSidebar />)

    act(() => useSidebarSearchStore.getState().requestFocus())

    expect(screen.getByTestId('file-tree-search-input')).toHaveFocus()
  })

  it('shows search matches expanded, instead of behind folders the user must open', () => {
    useFileExplorerStore.getState().actions.setTreeSearchQuery('Button')
    render(<FileTreeSidebar />)

    // The match itself is on screen, not just the `src` folder that contains it.
    expect(screen.getByTestId('file-tree-node-src/components/Button.tsx')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-node-README.md')).not.toBeInTheDocument()
  })

  it('marks what matched inside the name, so a row says why it survived the filter', () => {
    useFileExplorerStore.getState().actions.setTreeSearchQuery('utto')
    const { container } = render(<FileTreeSidebar />)

    const marks = Array.from(container.querySelectorAll('mark'))
    expect(marks.map((m) => m.textContent)).toEqual(['utto'])
  })

  /**
   * A folder is never a result, so every row on screen is a file that contains what you typed and
   * carries the mark to prove it. While folders *were* matchable — on their full path, kept whole
   * with everything under them — a query like `components` filled the tree with files that had
   * nothing of it in their own name and nothing to highlight, and the row you clicked was rarely
   * the row you meant.
   */
  it('answers nothing for a query that only names a folder', () => {
    useFileExplorerStore.getState().actions.setTreeSearchQuery('components')
    render(<FileTreeSidebar />)

    expect(screen.queryByTestId('file-tree-node-src/components/Button.tsx')).not.toBeInTheDocument()
    expect(screen.getByText('No files found')).toBeInTheDocument()
  })

  it('marks every row it does show, folders on the way included', () => {
    useFileExplorerStore.getState().actions.setTreeSearchQuery('Button')
    const { container } = render(<FileTreeSidebar />)

    // `src` and `components` are the path to the match, not matches — only the file is marked.
    const marks = Array.from(container.querySelectorAll('mark'))
    expect(marks.map((m) => m.textContent)).toEqual(['Button'])
  })

  it('tells the user when a search matches nothing', () => {
    useFileExplorerStore.getState().actions.setTreeSearchQuery('zzz')
    render(<FileTreeSidebar />)

    expect(screen.getByText('No files found')).toBeInTheDocument()
  })

  /** The panel slot belongs to the shell, so the tree's own collapse button flips the same flag ⌘S
   * and the toolbar's button do — not a files-only one that would leave the other views out of step. */
  it('hides itself through the shared panel flag when the collapse button is used', async () => {
    const user = userEvent.setup()
    render(<FileTreeSidebar />)

    await user.click(screen.getByTestId('file-tree-hide-sidebar'))

    expect(useRepoViewStore.getState().isPanelOpen).toBe(false)
  })
})
