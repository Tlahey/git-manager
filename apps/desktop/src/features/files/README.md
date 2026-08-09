# `features/files`

The project files view — one of a repo tab's three views, alongside the commit graph and the Kanban
board. It browses the working tree, and opens a file into the shared diff/blame viewer.

## Layout

```
features/files/
  index.ts                     the public surface — the ONLY thing outside code may import
  FilesPage.tsx                the view: breadcrumb, directory listing, diff viewer
  components/
    FileTreeSidebar.tsx        the left panel while this view is on screen
    FilesToolbar.tsx           the toolbar's middle section while this view is on screen
  hooks/
    useRepoFiles.ts            the working tree listing (SWR)
  lib/
    fileTree.ts                path list → tree, and the search filter over it — pure, no React
  stores/
    fileExplorer.store.ts      where the user had got to inside the view
```

## What lives elsewhere, and why

- **Whether this view is on screen** — `stores/repoView.store.ts`. One slot for the three views, so
  no pair of booleans can claim the central area at once. This feature does not know it can be
  closed; it knows what it shows.
- **The diff viewer** (`components/git-graph/DiffViewCenter`) and the **blame/history panel**. Both
  are shared with the graph view: the same file, opened from a commit or from the tree, is the same
  screen. When blame or history is up, `RepoWorkspace` puts that panel in the left slot instead of
  the tree — see its doc comment.
- **The terminal panel** — shared chrome, mounted by the page rather than owned by it.
- **The copy** (`packages/i18n`, `git` namespace, `fileExplorer.*` keys) and the **DTOs**
  (`packages/git-types`), which Rust mirrors.

## Why a feature folder rather than `components/file-explorer/`

It has a page, a panel, a toolbar section, a store, a data hook and its own pure logic — six files
that were spread across four of the app's layer folders and only ever changed together. The trigger
in `CLAUDE.md` is "its own page *and* its own store *or* its own `api/` domain"; this has the first
two. It has no `api/` of its own: one SWR hook over the app's `repo.api.ts` is not a domain.
