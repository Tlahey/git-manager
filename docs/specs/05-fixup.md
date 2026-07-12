# Spec 05 — Fixup & Autosquash

## Objective

Allow "correcting" a previous commit by creating a targeted `--fixup` commit, then cleaning up history via `rebase --autosquash`.

---

## Git concepts

### `git commit --fixup <commit>`

Creates a commit whose message is `fixup! <target commit message>`. This commit is meant to be merged with the target during an autosquash rebase.

```
Before fixup:
  A ← B ("feat: add login")
      ← C ("fix: typo in api")
      ← D (staged: fix for B)

After git commit --fixup B:
  A ← B ("feat: add login")
      ← C ("fix: typo in api")
      ← D ("fixup! feat: add login")

After rebase --autosquash:
  A ← B' ("feat: add login" + fixes from D)
      ← C ("fix: typo in api")
```

### `git rebase -i --autosquash`

Automatically reorders `fixup!` commits after their target, then merges them.

---

## User flow

### Creating a fixup

```
1. The user has staged files
2. In the commit panel, dropdown menu → "Commit as fixup"
   OR right-click on a commit in the graph → "Apply staged changes as fixup"

3. Target commit selector:
   ┌──────────────────────────────────────────────────────┐
   │  Choose the commit to fix                             │
   │                                                      │
   │  🔍 [Search history...]                              │
   │                                                      │
   │  ● abc1234  feat: add login page          2h ago    │
   │  ○ bcd2345  fix: typo in api              1d ago    │
   │  ○ cde3456  chore: update deps            3d ago    │
   │                                                      │
   │  [Cancel]                    [Create fixup]          │
   └──────────────────────────────────────────────────────┘

4. Commit created → visible in the graph with the "fixup!" label
5. Toast: "Fixup created for 'feat: add login page'"
```

### Applying autosquash

```
1. Click "Clean up history (autosquash)"
   OR right-click on the branch → "Autosquash..."

2. Preview:
   ┌──────────────────────────────────────────────────────┐
   │  Autosquash — preview                                │
   │                                                      │
   │  The following commits will be merged:                │
   │                                                      │
   │  ▶ abc1234  feat: add login page                    │
   │    └ def5678  fixup! feat: add login page           │
   │                                                      │
   │  ▶ bcd2345  fix: typo in api                        │
   │    └ ghi9012  fixup! fix: typo in api               │
   │                                                      │
   │  Result: 4 commits → 2 commits                       │
   │                                                      │
   │  ⚠️ Rebase from: cde3456 (3d ago)                   │
   │                                                      │
   │  [Cancel]                   [Apply]                  │
   └──────────────────────────────────────────────────────┘

3. Execution → graph updated
4. Notification: "2 fixups applied, history cleaned up"
```

---

## Detecting pending fixups

A badge/indicator is displayed in the branch bar when `fixup!` commits exist without having been autosquashed:

```
🔧 2 fixups pending  [Autosquash]
```

---

## Protections

- Forbidden on commits **already pushed** to a shared remote (warning, non-blocking)
- Automatic autosquash suggestion if `fixup!` commits are detected on launch
- Blocked if unrelated commits would be included in the rebase range (confirmation required)

---

## Tauri commands involved

| Command               | Parameters         | Description                                       |
| --------------------- | ------------------ | ------------------------------------------------- |
| `create_fixup_commit` | `path, target_oid` | Creates the `--fixup` commit                      |
| `get_pending_fixups`  | `path`             | Returns the list of pending fixups                |
| `autosquash_preview`  | `path`             | Returns the list of merges that will be performed |
| `run_autosquash`      | `path, base_oid?`  | Executes `rebase --autosquash`                    |

---

## React components

```
components/fixup/
├── FixupTargetSelector.tsx   # Target commit selector
├── AutosquashPreview.tsx     # Merge preview
├── PendingFixupsBadge.tsx    # "N fixups pending" badge
└── AutosquashResultToast.tsx # Post-execution notification
```

---

## i18n keys

```json
{
  "fixup.createTitle": "Créer un commit fixup",
  "fixup.selectTarget": "Choisir le commit à corriger",
  "fixup.searchPlaceholder": "Rechercher dans l'historique...",
  "fixup.created": "Fixup créé pour \"{{message}}\"",
  "fixup.pending": "{{count}} fixup(s) en attente",
  "fixup.autosquash.title": "Autosquash — aperçu",
  "fixup.autosquash.result": "{{count}} commit(s) fusionnés",
  "fixup.autosquash.warning": "Ces commits ont déjà été poussés. Continuer ?"
}
```
