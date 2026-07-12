# Spec 09 — Branch management

## Goal

Manage all operations on Git branches (creation, deletion, renaming, checkout, merge, comparison) from a unified interface.

---

## Branches view

Accessible via the repo sidebar → "Branches" section (tree-structured by prefix).

```
┌──────────────────────────────────────────────────────────┐
│  Branches                                    [+ Create]   │
├──────────────────────────────────────────────────────────┤
│  LOCAL                                                   │
│  ● main                      HEAD · 2h ago              │
│  ▶ feat/                                                 │
│      feat/login-page         ↑2 ↓0 · 1d ago  [···]     │
│      feat/api-refactor       ↑0 ↓3 · 3d ago  [···]     │
│  ▶ fix/                                                  │
│      fix/typo                ↑1 ↓0 · 10min   [···]     │
│                                                          │
│  REMOTE (origin)                                         │
│  ▶ origin/main               sync                       │
│  ▶ origin/feat/login-page    ↑0 ↓0                     │
└──────────────────────────────────────────────────────────┘
```

- **●** indicates the HEAD branch
- **↑N ↓M** = ahead/behind of the remote tracking branch
- **[···]** = context menu

---

## Features

### Create a branch

```
┌──────────────────────────────────────────────────────────┐
│  New branch                                              │
│                                                          │
│  Name:     [feat/my-feature                    ]         │
│  From:     [main                               ▾]        │
│                                                          │
│  ☑ Checkout automatically after creation                  │
│                                                          │
│  [Cancel]                          [Create]              │
└──────────────────────────────────────────────────────────┘
```

- Name validation (forbidden characters, conflicts)
- Prefix suggestion based on the name (feat/, fix/, chore/…)

### Checkout

- Double-click on a branch → checkout
- If working tree is dirty: offer auto-stash + checkout, or force with `--force`
- Checking out a remote branch → automatically creates the local tracking branch

### Rename a branch

- Inline edit (click on the name → editable)
- Updates the remote if the branch had been pushed (with confirmation)

### Delete a branch

```
Confirmation:
- Unpushed branch: "This branch has not been pushed. The commits will be lost."
- Merged branch: simple confirmation
- Remote: "Also delete origin/{{branch}}?" (checkbox)
```

Deleting the HEAD branch is forbidden.

### Merge

```
From the target branch (e.g. main) → right-click on the source branch → "Merge here"

┌──────────────────────────────────────────────────────────┐
│  Merge feat/login-page → main                            │
│                                                          │
│  5 commits to integrate                                  │
│  Strategy:                                                │
│  ● Merge (creates a merge commit)                        │
│  ○ Fast-forward if possible                               │
│  ○ Squash merge (all commits into one)                    │
│                                                          │
│  [Cancel]                          [Merge]               │
└──────────────────────────────────────────────────────────┘
```

### Compare two branches

```
Right-click on a branch → "Compare with..."

Diff view between the two branches:
- Commits in A but not in B (and vice versa)
- Cumulative diff of the files
```

---

## Tauri commands involved

| Command            | Parameters                           | Description                       |
| ------------------ | ------------------------------------ | --------------------------------- |
| `get_branches`     | `path, include_remote?`              | Full list                         |
| `create_branch`    | `path, name, from_ref`               | Creates a branch                  |
| `checkout_branch`  | `path, name, force?`                 | Checkout                          |
| `rename_branch`    | `path, old_name, new_name`           | Renames                           |
| `delete_branch`    | `path, name, force?, delete_remote?` | Deletes                           |
| `merge_branch`     | `path, source, strategy`             | Merge                             |
| `compare_branches` | `path, base, compare`                | Commits and diff between branches |
| `get_ahead_behind` | `path, branch`                       | Sync status vs remote             |

---

## TypeScript types

```typescript
export interface GitBranch {
  name: string
  shortName: string
  isHead: boolean
  isRemote: boolean
  upstream?: string
  commitOid: string
  commitMessage: string
  commitTimestamp: number
  aheadCount: number
  behindCount: number
}

export type MergeStrategy = 'merge' | 'fast-forward' | 'squash'
```

---

## React components

```
components/branch/
├── BranchList.tsx              # Tree-structured list
├── BranchItem.tsx              # One branch with indicators
├── CreateBranchDialog.tsx      # Creation dialog
├── DeleteBranchDialog.tsx      # Deletion dialog
├── MergeBranchDialog.tsx       # Merge dialog with strategy
└── CompareBranchesView.tsx     # Comparison view
```

---

## i18n keys

```json
{
  "branch.title": "Branches",
  "branch.create": "Créer une branche",
  "branch.checkout": "Checkout",
  "branch.rename": "Renommer",
  "branch.delete": "Supprimer",
  "branch.merge": "Merger ici",
  "branch.compare": "Comparer avec...",
  "branch.createDialog.name": "Nom de la branche",
  "branch.createDialog.from": "Depuis",
  "branch.createDialog.autoCheckout": "Checkout automatique",
  "branch.deleteDialog.notPushed": "Cette branche n'a pas été poussée. Les commits seront perdus.",
  "branch.deleteDialog.deleteRemote": "Supprimer aussi {{remote}}/{{branch}}",
  "branch.mergeDialog.title": "Merger {{source}} → {{target}}",
  "branch.mergeDialog.strategy.merge": "Merge",
  "branch.mergeDialog.strategy.ff": "Fast-forward",
  "branch.mergeDialog.strategy.squash": "Squash merge",
  "branch.aheadBehind": "↑{{ahead}} ↓{{behind}}"
}
```
