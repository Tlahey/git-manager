# Spec 08 — Stash management

## Objective

Allow managing Git stashes (temporarily setting changes aside) from a visual interface with diff preview.

---

## Stash view

Accessible via the repo sidebar → "Stashes" section or via the Actions menu.

```
┌──────────────────────────────────────────────────────────┐
│  Stashes — myapp                              [+ Stash]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  stash@{0}  WIP: login form refactor          2h ago    │
│             3 files · +42 -15                 [▾ Actions]│
│                                                          │
│  stash@{1}  On main: quick fix attempt        1d ago    │
│             1 file · +3 -1                    [▾ Actions]│
│                                                          │
│  stash@{2}  (no message)                      3d ago    │
│             5 files · +128 -34                [▾ Actions]│
│                                                          │
│                                           [Purge all]     │
└──────────────────────────────────────────────────────────┘
```

---

## Features

### Creating a stash (`stash push`)

```
"+ Stash" button (or Cmd+Shift+S) →

┌──────────────────────────────────────────────────────────┐
│  Set changes aside                                        │
│                                                          │
│  Message:  [WIP: refactoring auth              ]         │
│             (optional)                                    │
│                                                          │
│  Options:                                                 │
│  ☑ Include untracked files (--include-untracked)         │
│  ☐ Partial stash (select files)                          │
│                                                          │
│  Affected files: 3                                        │
│  • src/auth/login.ts (modified)                          │
│  • src/auth/logout.ts (modified)                         │
│  • src/components/LoginForm.tsx (new)                    │
│                                                          │
│  [Cancel]                       [Stash]                  │
└──────────────────────────────────────────────────────────┘
```

### Partial stash

If "partial stash" is checked, the user can select what will be stashed file by file (or hunk by hunk).

### Applying a stash (`stash pop` / `stash apply`)

Actions menu for a stash:

- **Pop** — Applies the stash AND removes it from the list
- **Apply** — Applies without removing (allows applying it to multiple branches)
- **Branch from** — Creates a new branch and applies the stash onto it

### Deleting a stash (`stash drop`)

- Simple confirmation (the stash will be lost)
- No recovery possible

### Purging all (`stash clear`)

- Double confirmation
- "This action will permanently delete **all** stashes."

### Previewing a stash

Clicking on a stash → side panel with:

- List of modified files with statuses (A/M/D)
- Full diff per file (expandable)
- Branch the stash was created on
- HEAD commit at the time of the stash

---

## Conflict handling on apply

If a `stash pop` or `apply` generates conflicts:

1. Operation interrupted, `CONFLICT` status
2. Conflicting files listed
3. Options: **Resolve** (opens the merge tool) / **Cancel the apply** (`git checkout .`)

---

## Tauri commands involved

| Command        | Parameters                                   | Description                   |
| -------------- | -------------------------------------------- | ----------------------------- |
| `stash_push`   | `path, message?, include_untracked?, paths?` | Creates a stash               |
| `stash_list`   | `path`                                       | Returns the list of stashes   |
| `stash_show`   | `path, index`                                | Returns the diff of a stash   |
| `stash_pop`    | `path, index?`                               | Applies and removes           |
| `stash_apply`  | `path, index?`                               | Applies without removing      |
| `stash_drop`   | `path, index`                                | Deletes a stash               |
| `stash_clear`  | `path`                                       | Deletes all stashes           |
| `stash_branch` | `path, index, branch_name`                   | Creates a branch from a stash |

---

## TypeScript types

```typescript
export interface GitStash {
  index: number // 0 = stash@{0}
  message: string
  branch: string // branch at the time of the stash
  commitOid: string // HEAD commit at the time of the stash
  timestamp: number
  filesCount: number
  additions: number
  deletions: number
}
```

---

## React components

```
components/stash/
├── StashList.tsx           # List of stashes
├── StashItem.tsx           # One entry with actions
├── StashPushDialog.tsx     # Stash creation dialog
├── StashPreviewPanel.tsx   # Stash diff panel
└── StashConflictBanner.tsx # Banner if conflict on apply
```

---

## i18n keys

```json
{
  "stash.title": "Stashes",
  "stash.push": "Mettre de côté",
  "stash.pop": "Pop (appliquer et supprimer)",
  "stash.apply": "Appliquer",
  "stash.drop": "Supprimer",
  "stash.clear": "Purger tout",
  "stash.branch": "Créer une branche depuis ce stash",
  "stash.noMessage": "(sans message)",
  "stash.pushDialog.title": "Mettre de côté les modifications",
  "stash.pushDialog.message": "Message (optionnel)",
  "stash.pushDialog.includeUntracked": "Inclure les fichiers non-suivis",
  "stash.pushDialog.partial": "Stash partiel",
  "stash.clearConfirm": "Supprimer définitivement TOUS les stashes ?",
  "stash.conflict": "Conflits lors de l'application du stash.",
  "stash.files": "{{count}} fichier(s)"
}
```
