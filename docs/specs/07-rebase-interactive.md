# Spec 07 — Interactive Rebase

## Objective

Allow performing a `git rebase -i` from a drag & drop interface, without going through a text editor. The user can visually reorder, merge, delete, and rewrite commits.

---

## Available rebase actions

| Action   | Shortcut | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `pick`   | p        | Keep the commit as-is                               |
| `reword` | r        | Keep the commit, edit the message                   |
| `edit`   | e        | Pause at this commit to amend                       |
| `squash` | s        | Merge with the previous commit, combine messages    |
| `fixup`  | f        | Merge with the previous commit, discard the message |
| `drop`   | d        | Delete this commit                                  |

---

## User flow

### Starting an interactive rebase

```
1. Right-click on a commit in the git tree → "Interactive rebase from here..."
   OR branch menu → "Interactive rebase..."

2. Base selection:
   - Default: selected commit (all commits since it)
   - Alternative: "Last N commits" (numeric input)

3. Opening the Interactive Rebase panel
```

### Rebase interface

```
┌──────────────────────────────────────────────────────────────┐
│  Interactive rebase — 4 commits                             │
│                                     [Cancel]  [Execute]      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⠿  [pick  ▾]  abc1234  feat: add login page               │
│  ⠿  [squash▾]  bcd2345  fix: typo in login                  │
│  ⠿  [pick  ▾]  cde3456  chore: update deps                  │
│  ⠿  [drop  ▾]  def4567  WIP: temp                          │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  Result preview:                                              │
│  ● abc1234' feat: add login page (+ fix: typo in login)     │
│  ● cde3456  chore: update deps                              │
│  (def4567 will be removed)                                     │
└──────────────────────────────────────────────────────────────┘
```

- **Drag & drop** (⠿ icon) to reorder commits
- **Dropdown** per commit to change the action
- **Real-time preview** of the final result
- `squash`/`fixup` commits are visually "attached" to their parent

### Inline reword

When the action is `reword`, a text field appears directly in the list:

```
⠿  [reword▾]  abc1234  [feat: add login page          ]
```

### Execution

```
1. Click "Execute"
2. Confirmation if published commits are included:
   "⚠️ These commits have already been pushed. Continue?"

3. Background execution with progress:
   ┌─────────────────────────────────┐
   │  Rebase in progress...          │
   │  Commit 2/4: cde3456            │
   │  [████████░░] 50%               │
   │                      [Abort]    │
   └─────────────────────────────────┘

4. On conflict → pause:
   ┌─────────────────────────────────────────────────────┐
   │  ⚠️ Conflict on bcd2345 "fix: typo in login"        │
   │                                                     │
   │  Conflicting files:                                 │
   │  • src/pages/Login.tsx                              │
   │                                                     │
   │  Resolve the conflicts, then:                       │
   │  [Abort]    [Skip this commit]    [Continue]        │
   └─────────────────────────────────────────────────────┘

5. Success → graph updated, notification
```

---

## Managing mid-rebase state

If the application is closed during an ongoing rebase:

- On next launch, the `REBASE_HEAD` state is detected
- Banner "A rebase is in progress" with Continue / Abort actions
- The remaining steps are displayed as-is

---

## Keyboard shortcuts in the panel

| Shortcut    | Action                   |
| ----------- | ------------------------ |
| `P`         | Pick action              |
| `S`         | Squash action            |
| `F`         | Fixup action             |
| `R`         | Reword action            |
| `D`         | Drop action              |
| `↑↓`        | Move the selected commit |
| `Cmd+Enter` | Execute                  |
| `Esc`       | Cancel                   |

---

## Tauri commands involved

| Command                    | Parameters                            | Description                                |
| -------------------------- | ------------------------------------- | ------------------------------------------ |
| `get_rebase_commits`       | `path, base_oid`                      | Returns the list of editable commits       |
| `start_interactive_rebase` | `path, base_oid, steps: RebaseStep[]` | Starts the rebase                          |
| `continue_rebase`          | `path`                                | Continues after conflict resolution        |
| `abort_rebase`             | `path`                                | Aborts the ongoing rebase                  |
| `skip_rebase_commit`       | `path`                                | Skips the current commit                   |
| `get_rebase_state`         | `path`                                | Current state (if a rebase is in progress) |

```typescript
export interface RebaseStep {
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'
  oid: string
  message: string // new message for reword
}
```

---

## React components

```
components/rebase/
├── RebasePanel.tsx            # Main panel
├── RebaseStepList.tsx         # Drag & drop list of commits
├── RebaseStepRow.tsx          # A single row (action + commit)
├── RebasePreview.tsx          # Result preview
├── RebaseProgress.tsx         # Progress bar during execution
├── RebaseConflictBanner.tsx   # Conflict pause
└── RebaseInProgressBanner.tsx # Detection of an existing rebase
```

---

## i18n keys

```json
{
  "rebase.title": "Rebase interactif — {{count}} commits",
  "rebase.execute": "Exécuter",
  "rebase.cancel": "Annuler",
  "rebase.abort": "Aborter",
  "rebase.continue": "Continuer",
  "rebase.skip": "Skip ce commit",
  "rebase.actions.pick": "pick",
  "rebase.actions.reword": "reword",
  "rebase.actions.squash": "squash",
  "rebase.actions.fixup": "fixup",
  "rebase.actions.drop": "drop",
  "rebase.preview.title": "Aperçu du résultat",
  "rebase.inProgress": "Un rebase est en cours.",
  "rebase.conflict": "Conflit sur \"{{message}}\"",
  "rebase.conflictFiles": "Fichiers en conflit : {{count}}"
}
```
