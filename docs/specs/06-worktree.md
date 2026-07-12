# Spec 06 — Worktree management

## Goal

Allow creating, listing, switching, and removing Git worktrees from a visual interface. A worktree allows having multiple branches checked out simultaneously in separate folders.

---

## Git Worktree concept

```bash
# Main repo
/Projects/myapp/          → branch: main

# Additional worktrees
/Projects/myapp-feat/     → branch: feat/new-feature
/Projects/myapp-hotfix/   → branch: hotfix/critical-fix
```

Each worktree shares the same `.git/` (via `.git/worktrees/`), but has its own working directory and its own branch.

---

## Worktrees view

Accessible from the repo sidebar → "Worktrees" tab or via the menu.

```
┌──────────────────────────────────────────────────────────┐
│  Worktrees — myapp                                       │
│                                            [+ New]        │
├──────────────────────────────────────────────────────────┤
│  ● main (main)                                            │
│    /Projects/myapp                                       │
│    Last commit: abc1234 — 2h ago                          │
│                                                          │
│  ○ feat/new-feature                                      │
│    /Projects/myapp-feat                                  │
│    Last commit: bcd2345 — 1d ago            [Open]     │
│                                                          │
│  ○ hotfix/critical-fix                                   │
│    /Projects/myapp-hotfix                                │
│    Last commit: cde3456 — 10min ago         [Open]     │
│                                             [Remove]     │
└──────────────────────────────────────────────────────────┘
```

---

## Features

### Create a worktree

```
Click "+ New" →

┌──────────────────────────────────────────────────────────┐
│  New worktree                                            │
│                                                          │
│  Branch:  [feat/my-feature           ▾]                 │
│             ○ Existing branch                            │
│             ● New branch                                 │
│                                                          │
│  New name:  [feat/my-feature                    ]        │
│  From:      [main                              ▾]        │
│                                                          │
│  Path:  [/Projects/myapp-my-feature              ] [...]  │
│            (automatic suggestion)                        │
│                                                          │
│  [Cancel]                         [Create worktree]      │
└──────────────────────────────────────────────────────────┘
```

- The path is suggested automatically: `<parent_dir>/<repo>-<branch_name>`
- The branch cannot already be checked out in another worktree

### Open a worktree

Click "Open" → opens the worktree as a **new tab** in the application with its own Git context.

The worktree appears in the dashboard sidebar with a distinct icon (🔀) indicating that it is a linked worktree.

### Remove a worktree

```
1. Click "Remove"
2. Confirmation dialog:
   - If worktree is clean: simple confirmation
   - If worktree is dirty: warning + reinforced confirmation
3. Option: "Also delete the associated branch"
4. Execution → folder removed + worktree removed from the .git registry
```

### Sync the worktrees

"Sync" button in the list → performs a `fetch` on all worktrees at once and updates the statuses.

---

## Possible statuses

| Status   | Icon     | Description                       |
| -------- | -------- | --------------------------------- |
| Clean    | ✓ green  | No changes                        |
| Dirty    | • orange | Uncommitted changes               |
| Ahead    | ↑ blue   | Unpushed commits                  |
| Behind   | ↓ gray   | Commits to pull                   |
| Locked   | 🔒       | Worktree manually locked          |
| Prunable | ⚠️       | Folder deleted, orphaned worktree |

---

## Detection of orphaned worktrees

On startup or during a refresh, the app detects worktrees whose folder no longer exists and offers to prune them (`git worktree prune`).

---

## Tauri commands involved

| Command           | Parameters                                        | Description                       |
| ----------------- | ------------------------------------------------- | --------------------------------- |
| `list_worktrees`  | `path`                                            | Returns all worktrees of the repo |
| `add_worktree`    | `path, branch, worktree_path, new_branch?, from?` | Creates a worktree                |
| `remove_worktree` | `path, worktree_path, force?`                     | Removes a worktree                |
| `lock_worktree`   | `path, worktree_path, reason?`                    | Locks                             |
| `prune_worktrees` | `path`                                            | Removes orphaned entries          |

---

## TypeScript types

```typescript
export interface GitWorktree {
  path: string
  branch: string
  commitOid: string
  isMain: boolean
  isLocked: boolean
  isDirty: boolean
  isPrunable: boolean
  lockedReason?: string
}
```

---

## React components

```
components/worktree/
├── WorktreeList.tsx          # Full list
├── WorktreeItem.tsx          # One worktree row
├── AddWorktreeDialog.tsx     # Creation dialog
├── RemoveWorktreeDialog.tsx  # Removal dialog with options
└── WorktreeBadge.tsx         # Badge in the sidebar (linked indicator)
```

---

## i18n keys

```json
{
  "worktree.title": "Worktrees",
  "worktree.add": "Nouveau worktree",
  "worktree.open": "Ouvrir",
  "worktree.remove": "Supprimer",
  "worktree.main": "Principal",
  "worktree.locked": "Verrouillé",
  "worktree.prunable": "Dossier introuvable",
  "worktree.addDialog.title": "Nouveau worktree",
  "worktree.addDialog.branch": "Branche",
  "worktree.addDialog.newBranch": "Nouvelle branche",
  "worktree.addDialog.path": "Chemin du dossier",
  "worktree.removeDialog.dirty": "Ce worktree a des modifications non commitées.",
  "worktree.removeDialog.deleteBranch": "Supprimer aussi la branche {{branch}}",
  "worktree.orphansFound": "{{count}} worktree(s) orphelin(s) trouvé(s). Purger ?"
}
```
