# Spec 04 — Rollback

## Goal

Allow undoing commits or changes safely, with a clear preview of the consequences before any destructive action.

---

## Rollback modes

### 1. `git revert` — Non-destructive undo

Creates a new commit that undoes the changes of an existing commit. **Safe on shared branches.**

```
Before: A → B → C (HEAD)
After:  A → B → C → C' (revert of C)
```

**When to use it**: branch shared with others, when you want to keep the history intact.

### 2. `git reset --soft` — Soft reset

Moves HEAD without touching staging or files.

```
Before: A → B → C (HEAD)  [nothing staged]
After:  A → B (HEAD)      [C is "unstaged", files intact]
```

**When to use it**: rewording one or more recent commits, re-splitting.

### 3. `git reset --mixed` (default)

Moves HEAD and clears staging, files intact.

```
After: A → B (HEAD)  [C's changes in the working tree]
```

### 4. `git reset --hard` — Full reset ⚠️

Moves HEAD, clears staging **and wipes out file changes**.

```
After: A → B (HEAD)  [C's changes permanently lost]
```

**Requires explicit confirmation.**

---

## User flow

### Revert a commit

```
1. Right-click on a commit in the git tree → "Revert this commit"
   OR action from the detail panel

2. Preview dialog:
   ┌─────────────────────────────────────────────────────┐
   │  Revert "feat: add login page" (abc1234)             │
   │                                                     │
   │  This will create a new commit:                     │
   │  "Revert 'feat: add login page'"                    │
   │                                                     │
   │  Files affected: 3                                  │
   │  [view the revert diff]                             │
   │                                                     │
   │  [Cancel]           [Confirm revert]                │
   └─────────────────────────────────────────────────────┘

3. Execution → new commit visible in the graph
4. Notification: "Revert created: def5678"
```

### Reset to a commit

```
1. Right-click on a commit → "Reset to here..."
   OR from the detail panel

2. Mode selection:
   ┌─────────────────────────────────────────────────────┐
   │  Reset to "chore: update deps" (bcd2345)            │
   │                                                     │
   │  Commits that will be undone: 2                     │
   │  • abc1234 feat: add login page                     │
   │  • xyz9876 fix: typo                                │
   │                                                     │
   │  Mode:                                              │
   │  ○ Soft   — keep the changes (staged)               │
   │  ● Mixed  — keep the changes (unstaged)              │
   │  ○ Hard   — DELETE the changes ⚠️                    │
   │                                                     │
   │  [Cancel]                [Apply reset]              │
   └─────────────────────────────────────────────────────┘

3. If Hard mode: additional confirmation
   "This action is irreversible. Are you sure?"
   → input required: type "RESET" to confirm

4. Execution → graph updated
```

---

## Branch protection

Reset actions (destructive) are blocked by default on protected branches (configurable in Settings):
- `main`, `master`, `develop` → blocked by default
- Explicit error message if attempted
- Can be unblocked in Settings → Git → Protected Branches

---

## Tauri commands involved

| Command | Parameters | Description |
|---------|-----------|-------------|
| `revert_commit` | `path, oid, no_commit?` | Revert with or without auto-commit |
| `reset_to_commit` | `path, oid, mode: soft\|mixed\|hard` | Reset HEAD |
| `get_commits_between` | `path, from_oid, to_oid` | List of commits between two SHAs |
| `get_revert_diff` | `path, oid` | Diff preview of the revert before execution |

---

## Conflict handling

If a `git revert` generates conflicts:
1. The operation is interrupted with status `CONFLICT`
2. The app switches to "Conflict resolution" mode
3. Conflicting files are listed with visual markers
4. Options: **Continue the revert** (after resolution) / **Abort**

---

## React components

```
components/rollback/
├── RevertDialog.tsx         # Revert preview dialog
├── ResetDialog.tsx          # Reset mode selection dialog
├── CommitListPreview.tsx    # List of commits that will be undone
├── HardResetConfirm.tsx     # Double confirmation for --hard
└── ConflictBanner.tsx       # Banner shown on post-revert conflict
```

---

## i18n keys

```json
{
  "rollback.revert.title": "Revert \"{{message}}\"",
  "rollback.revert.description": "Cela va créer un nouveau commit qui annule ce changement.",
  "rollback.revert.confirm": "Confirmer le revert",
  "rollback.reset.title": "Reset jusqu'à ce commit",
  "rollback.reset.commitsAffected": "{{count}} commit(s) seront défaits",
  "rollback.reset.soft": "Soft — garder les changements (staged)",
  "rollback.reset.mixed": "Mixed — garder les changements (unstaged)",
  "rollback.reset.hard": "Hard — SUPPRIMER les changements",
  "rollback.reset.hardWarning": "Cette action est irréversible.",
  "rollback.reset.hardConfirmPlaceholder": "Tapez RESET pour confirmer",
  "rollback.protected.branch": "La branche {{branch}} est protégée. Modifiez les paramètres pour continuer.",
  "rollback.conflict": "Conflit lors du revert. Résolvez les conflits puis continuez."
}
```
