# Spec 02 — Git Tree (Graph visualization)

## Goal

Display Git history as an interactive graph, with branches, tags, and commit detail accessible in one click.

---

## General view

The Git Tree view is the main view of a repo. It consists of:

```
┌──────────────────────────────────────────────────────────────┐
│  [Toolbar: filter, refresh, options]                          │
├───────────────────────────────┬──────────────────────────────┤
│                               │                              │
│    Git graph                  │   Commit detail panel        │
│    (left column)              │   (right column)             │
│                               │                              │
│  ●─────── feat/login ──────── │  Commit abc1234              │
│  │  ●──── fix/typo ─────────  │  Author: Antoine             │
│  │  │                        │  Date: 2026-06-20             │
│  ●──┘  Merge fix/typo        │                              │
│  │                           │  feat: add login page         │
│  ●     chore: update deps     │                              │
│  │                           │  ─────────────────────────── │
│  ●     initial commit         │  Diff                        │
│                               │  + src/pages/Login.tsx       │
└───────────────────────────────┴──────────────────────────────┘
```

---

## Git graph

### Rendering

- Each commit is a **node** (colored circle)
- **Lines** connect parent/child commits
- **Branches** and **tags** are colored labels on the corresponding node
- The **HEAD branch** is highlighted

### Layout algorithm

The graph is computed on the Rust side (`git/graph.rs`) and returned with column coordinates:

```typescript
export interface GraphNode {
  commit: GitCommit
  column: number // X column in the grid
  connections: GraphEdge[]
  refs: GitRef[]
}

export interface GraphEdge {
  fromColumn: number
  toColumn: number
  color: string
}

export interface GitRef {
  name: string
  type: 'branch' | 'tag' | 'remote' | 'HEAD'
  color: string
}
```

### Colors

Each branch is assigned a stable color (hash of the name → palette). Colors remain consistent across sessions.

### Virtualization

History can contain thousands of commits. The graph uses a virtualized list (`@tanstack/react-virtual`) to render only the visible rows.

---

## Commit detail panel

Triggered by clicking a node in the graph.

### Contents

- Full SHA-1 + copy button
- Associated branches / tags
- Author (optional gravatar avatar) + email + relative date
- Full message (subject + body if present)
- Statistics: N files changed, +X -Y lines
- Diff per file (expandable, syntax highlighting)

### Diff

- Unified diff rendering with syntax highlighting (`shiki` or `prism`)
- "View full file" button (preview of the file at this commit)
- Change type indicator: Added / Modified / Deleted / Renamed

### Actions on a commit

From the detail panel:

- **Checkout** this commit (detached HEAD mode)
- **Create a branch** from this commit
- **Revert** this commit
- **Reset** to this commit (soft / mixed / hard)
- **Copy the SHA**
- **Fixup** (commit a fixup from the current changes onto this commit)
- **Cherry-pick** (future)

---

## Filters and search

- **Branch**: dropdown of all branches (local + remote)
- **Author**: free text
- **Date**: date range
- **Message**: text search within messages
- **File**: show only commits touching a given file

---

## Zoom and navigation

- Vertical scroll: scroll through history
- **Ctrl+F**: focus the search bar
- **Ctrl+Home**: return to the HEAD commit
- Click a branch label: quick filter on that branch

---

## Tauri commands involved

| Command           | Parameters                                            | Return             |
| ----------------- | ----------------------------------------------------- | ------------------ |
| `get_log`         | `path, limit, skip, branch?, author?, since?, until?` | `GraphNode[]`      |
| `get_commit_diff` | `path, oid`                                           | `GitDiff`          |
| `get_commit_file` | `path, oid, file_path`                                | `string` (content) |
| `get_refs`        | `path`                                                | `GitRef[]`         |

---

## React components

```
components/git-graph/
├── GitGraph.tsx           # Main container + virtualization
├── GraphRow.tsx           # One row = one commit
├── GraphCanvas.tsx        # SVG drawing of connection lines
├── RefLabel.tsx           # Branch/tag/remote label
├── CommitPanel.tsx        # Detail panel (right column)
├── DiffViewer.tsx         # Diff display
└── CommitActions.tsx      # Commit actions menu
```

---

## i18n keys

```json
{
  "gitTree.noCommits": "Aucun commit",
  "gitTree.loading": "Chargement de l'historique...",
  "gitTree.filterBranch": "Filtrer par branche",
  "gitTree.filterAuthor": "Filtrer par auteur",
  "gitTree.detailPanel.sha": "SHA",
  "gitTree.detailPanel.copy": "Copier",
  "gitTree.detailPanel.filesChanged": "{{count}} fichier(s) modifié(s)",
  "gitTree.actions.checkout": "Checkout",
  "gitTree.actions.createBranch": "Créer une branche ici",
  "gitTree.actions.revert": "Revert",
  "gitTree.actions.reset": "Reset..."
}
```
