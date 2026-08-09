/**
 * The files feature's **public surface** — everything the rest of the app may import, and nothing
 * else.
 *
 * Same statement as `features/board/index.ts` makes, for the same reason: code outside
 * `features/files/` imports from `features/files`, never from a path inside it, so "the app depends
 * on this" is one `grep` rather than a reading of the folder.
 *
 * Four names, and each is a *slot* of the repo tab that this view fills — its page, its left panel,
 * its section of the toolbar — plus the store `RepoView` needs to point the explorer at the right
 * repository. Nothing else about browsing files is anyone's business.
 */

/** The view itself: breadcrumb, directory listing, and the diff viewer a file opens into. */
export { FilesPage } from './FilesPage'

/** The left panel while this view is on screen — the working tree. */
export { FileTreeSidebar } from './components/FileTreeSidebar'

/**
 * **No toolbar section, deliberately.** This view had one — a file search and a tree toggle — and
 * both left: the search is the panel's own field (it filters that tree and nothing else), and the
 * panel toggle belongs to the toolbar shell, which owns the slot for all three views. What remained
 * was a "close the open file" button duplicating the breadcrumb above the file. A view supplying no
 * toolbar commands is the split working, not a gap in it.
 */

/** Where the user had got to inside the view. Read from outside only to re-point it at another
 * repository on a tab switch — see the store's `syncRepo`. */
export { useFileExplorerStore } from './stores/fileExplorer.store'
