# Spec 11 — Pedagogy & Learning Mode

## Objective

Make git-manager an application that **educates the user** as much as it helps them. Every action can be accompanied by contextual explanations, equivalent git commands, and a session memory that lets the user understand what just happened — with the local LLM acting as a pedagogical assistant.

---

## Feature overview

```
Pedagogy
├── 1. Git Console             — real-time equivalent git commands
├── 2. Pedagogical tooltips    — explanation + risk on every action
├── 3. Pre-destructive preview — exact command shown before a risky execution
├── 4. Inline Git glossary     — hover a term → definition
├── 5. Post-action summary     — enriched toast after each operation
├── 6. Learning mode           — explanatory panel before execution
└── 7. Action journal          — session history + LLM explanation
```

All these features are **optional and configurable** from the [Learning](#section--learning-settings) section of Settings.

---

## Feature 1 — Git Console

### Objective

Let the user see, in real time, the exact `git` commands being executed in the background, as if they had typed them themselves in a terminal.

### Interface

```
┌──────────────────────────────────────────────────────────────────────┐
│  Git Console                                              [✕ Close]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  14:32:01  ✓  git fetch origin                           (320ms)    │
│  14:32:04  ✓  git commit -m "feat: add login page"       (45ms)     │
│  14:32:08  ✗  git push origin main                       (1.2s)     │
│               error: failed to push — remote contains work you do   │
│               not have locally                                       │
│                                                                      │
│                                              [Clear]                 │
└──────────────────────────────────────────────────────────────────────┘
```

The console is displayed in a collapsible panel at the bottom of the repo view (like an embedded terminal).

### Behavior

- **Activation**: button in the repo toolbar or shortcut `⌘+Shift+L`
- **Persistence**: the open/closed state is saved in `settings.showGitConsole`
- **Entries**: each entry contains `timestamp | status | command | duration`
- **Errors**: on failure, the error output is displayed in red on the next line (collapsed, expandable)
- **Scroll**: auto-scrolls to the bottom on each new entry
- **Limit**: 100 entries kept (session only, not persisted)
- **Clear**: a "Clear" button empties the list for the session

### Architecture

```
Rust (after command resolution)
  → app_handle.emit("git:command", GitCommandEvent { ... })

Frontend
  → listen("git:command", handler)
  → useConsoleStore (Zustand, session)
  → <GitConsolePanel> inside <RepoView>
```

```rust
// models.rs
#[derive(Clone, serde::Serialize)]
pub struct GitCommandEvent {
    pub cmd: String,          // "git commit -m \"feat: login\""
    pub timestamp: u64,       // Unix ms
    pub duration_ms: u64,
    pub ok: bool,
    pub error: Option<String>,
}
```

> **Note**: The event is emitted **after** resolution. The displayed command is the equivalent CLI reconstruction, not the internal libgit2 call.

---

## Feature 2 — Pedagogical tooltips

### Objective

Every action button shows, on hover, an explanation of what it does, the associated risk level, and the equivalent git command.

### Interface

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠️  Reset --hard                                           │
│                                                              │
│  Resets HEAD to this commit and permanently erases           │
│  all uncommitted changes.                                     │
│                                                              │
│  Risk:  🔴 Destructive — cannot be undone                   │
│  Command: git reset --hard <commit-sha>                      │
└──────────────────────────────────────────────────────────────┘
```

### Risk levels

| Level | Icon | Description |
|--------|-------|-------------|
| `safe` | `✅ Safe` | No effect on history or files |
| `reversible` | `⚠️ Reversible` | Modifies history but can be undone (revert, reflog) |
| `destructive` | `🔴 Destructive` | Possible data loss, hard to undo |

### Component

```tsx
// packages/ui/src/components/ActionTooltip.tsx
<ActionTooltip
  action="reset-hard"
  side="top"
>
  <Button variant="destructive">Reset --hard</Button>
</ActionTooltip>
```

Tooltip content is managed via `packages/i18n/locales/*/action-tooltips.json`.

### Activation

Toggle `showPedagogicTooltips` in the Settings Learning section. Enabled by default.

---

## Feature 3 — Pre-destructive command preview

### Objective

Before any risky action, insert an explicit display of the git command that is about to run, in addition to the confirmation that already exists.

### Actions concerned

| Action | Command shown |
|--------|------------------|
| `reset --hard` | `git reset --hard <sha>` |
| `rebase -i` | `git rebase -i <base>` |
| `push --force` | `git push --force origin <branch>` |
| `drop` (rebase) | `git rebase --drop <sha>` |
| `branch -D` | `git branch -D <name>` |

### Interface (addition to existing modals)

```
┌──────────────────────────────────────────────────────────────┐
│  Confirm reset --hard                                        │
│                                                              │
│  Command that will be executed:                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  git reset --hard a1b2c3d                             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ⚠️  Uncommitted changes will be lost.                       │
│                                                              │
│  Type RESET to confirm: [          ]                        │
│                                          [Cancel] [Reset]    │
└──────────────────────────────────────────────────────────────┘
```

### Activation

Option `skipCommandPreview` in the Settings Learning section. Disabled by default (preview enabled).

---

## Feature 4 — Inline Git glossary

### Objective

Let the user understand Git technical terms directly in the interface, without leaving the application.

### Interface

Technical terms are displayed with a **dotted underline**. On hover:

```
  Interactive rebase lets you…
       ───────────────
       ↓
┌──────────────────────────────────────────┐
│  rebase                                  │
│                                          │
│  Replays a series of commits onto a      │
│  new base. Rewrites history.             │
│                                          │
│  📖 Git documentation                   │
└──────────────────────────────────────────┘
```

### Component

```tsx
// packages/ui/src/components/GitTerm.tsx
<GitTerm term="rebase" />
<GitTerm term="HEAD" />
<GitTerm term="staging-area" />
```

### Dictionary

File `packages/i18n/locales/*/git-glossary.json` — about 35 terms:

```json
{
  "HEAD": "Pointeur vers le dernier commit de la branche courante.",
  "rebase": "Rejoue une série de commits sur une nouvelle base, réécrivant l'historique.",
  "staging-area": "Zone intermédiaire entre le working tree et le dépôt. Les fichiers stagés seront inclus dans le prochain commit.",
  "fast-forward": "Fusion sans commit de merge, possible uniquement quand l'historique est linéaire.",
  "stash": "Sauvegarde temporaire des modifications non committées.",
  "worktree": "Copie de travail supplémentaire du même dépôt, dans un dossier différent.",
  "cherry-pick": "Applique les changements d'un commit spécifique sur la branche courante.",
  "reflog": "Journal de toutes les positions de HEAD, utile pour récupérer des commits perdus.",
  "detached HEAD": "État où HEAD pointe directement sur un commit plutôt que sur une branche.",
  "squash": "Fusionne plusieurs commits en un seul.",
  "fixup": "Comme squash, mais ignore le message du commit fusionné.",
  "revert": "Crée un commit qui annule les changements d'un commit existant, sans réécrire l'historique."
}
```

### Usage

Primarily used in Learning mode (Feature 6) and the Action journal (Feature 7). Can also be used occasionally in interface descriptions.

---

## Feature 5 — Post-action summary

### Objective

After each major operation, show an enriched toast that explains what just happened in natural language, along with the equivalent commands.

### Interface

```
┌──────────────────────────────────────────────────────┐
│  ✅  Commit created successfully                     │
│                                                      │
│  2 files committed on main (feat: add login)         │
│                                                      │
│  ▶ View commands (2)                                 │
│    git add src/login.tsx src/auth.ts                 │
│    git commit -m "feat: add login"                   │
│                                                      │
│  ▶ Open in Journal                                    │
└──────────────────────────────────────────────────────┘
```

The command details are **collapsed by default** and expandable. The toast disappears after 6 seconds or on click.

### Actions covered

- Commit, amend
- Push, pull, fetch
- Reset (soft / mixed / hard)
- Revert
- Interactive rebase
- Stash push / pop / drop
- Branch creation / deletion
- Worktree creation / deletion
- Fixup / autosquash

### Activation

Toggle `showPostActionSummary` in the Settings Learning section. Enabled by default.

---

## Feature 6 — Learning mode

### Objective

Offer a mode where, before executing an action, a panel is displayed with a contextual explanation adapted to the user's level (beginner or intermediate).

### Levels

| Level | Description |
|--------|-------------|
| `off` | Disabled — standard behavior |
| `beginner` | Full narrative explanation, detailed risks, suggested alternatives |
| `intermediate` | Compact — command + risk only |

### Interface — `beginner` level

```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ️  About Reset --hard                                         │
│                                                                 │
│  You are about to perform a reset --hard.                      │
│                                                                 │
│  What it does:                                                  │
│  Git will move HEAD to commit a1b2c3d and permanently          │
│  erase all uncommitted changes                                  │
│  in your files.                                                 │
│                                                                 │
│  ⚠️  Risk: Your changes will be lost.                          │
│                                                                 │
│  Safer alternatives:                                            │
│  → git stash     (set aside without losing anything)           │
│  → git reset --soft (keep the modified files)                  │
│                                                                 │
│  Command: git reset --hard a1b2c3d                              │
│                                                                 │
│             [Don't show again for this action]                 │
│                               [Cancel]  [Run anyway]            │
└─────────────────────────────────────────────────────────────────┘
```

### Interface — `intermediate` level

```
┌────────────────────────────────────────────────────┐
│  git reset --hard a1b2c3d                          │
│  🔴 Destructive                                    │
│                       [Cancel]  [Run]               │
└────────────────────────────────────────────────────┘
```

### Architecture

The pedagogical content is a static dictionary in `packages/i18n`:

```typescript
// packages/i18n/src/actionExplainMap.ts
export type ActionExplain = {
  titleKey: string
  descriptionKey: string   // narrative
  risk: 'safe' | 'reversible' | 'destructive'
  commandTemplate: string  // with placeholders
  alternativesKeys?: string[]
}

export const actionExplainMap: Record<string, ActionExplain> = {
  'reset-hard': { ... },
  'rebase-interactive': { ... },
  'push-force': { ... },
  // ...
}
```

Each concerned action exposes a `useActionGuard(actionId, params)` hook that returns `{ shouldShow, proceed, cancel }`.

### Activation

Toggle `learningMode: 'off' | 'beginner' | 'intermediate'` in the Settings Learning section.

---

## Feature 7 — Action journal

### Objective

Keep a **session history** of all operations performed, in the form of readable documents, and let the user request a detailed explanation from the local LLM (Ollama).

### Interface — Journal panel

```
┌──────────────────────────────────────────────────────────────────────┐
│  Action Journal                                          [Clear]     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ▶ 14:32 — Commit "feat: add login page"                            │
│  ▼ 14:28 — Fetch origin                                             │
│  │                                                                   │
│  │  Repo    : my-app                                                 │
│  │  Branch  : main                                                   │
│  │  Result  : 2 new branches, HEAD unchanged                        │
│  │                                                                   │
│  │  Commands:                                                        │
│  │    git fetch origin                                               │
│  │                                                                   │
│  │  [✨ Explain with Ollama]                                         │
│  │                                                                   │
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  │  The fetch command retrieves the remote's metadata without       │
│  │  modifying your local branch. Here, two new branches were        │
│  │  discovered (feature/auth, fix/typo). Your HEAD                  │
│  │  stays on the same commit — no change to your files.             │
│  │                                                                   │
│  ▶ 14:25 — Reset --hard to a1b2c3d                                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Structure of a journal entry

Each entry is a structured object (generated on the frontend side):

```typescript
interface ActionJournalEntry {
  id: string               // uuid
  timestamp: number        // Unix ms
  actionType: string       // "commit" | "push" | "reset" | "rebase" | ...
  title: string            // human-readable summary
  repo: string             // repo name
  branch: string           // current branch
  commands: string[]       // equivalent git commands
  context: Record<string, string>  // before/after: HEAD, file count...
  llmExplanation?: string  // streamed, added after clicking "Explain"
}
```

### LLM explanation

The **"Explain with Ollama"** button builds a markdown prompt from the entry:

```markdown
# Action Git : Fetch

**Repo** : my-app
**Branche** : main
**Date** : 2026-06-23 14:28

## Commandes exécutées
- git fetch origin

## Résultat
- 2 nouvelles branches découvertes : feature/auth, fix/typo
- HEAD inchangé

## Contexte avant
- HEAD : a1b2c3d
- Remote tracking : origin/main @ a1b2c3d

## Contexte après
- HEAD : a1b2c3d (inchangé)
- Nouvelles refs : origin/feature/auth, origin/fix/typo

Explique en détail ce qui s'est passé et ce que ça signifie pour l'utilisateur.
```

This prompt is sent to Ollama via `useOllamaGeneration` (already implemented in M3). The response is streamed directly into the journal entry.

### Store

```typescript
// stores/actionJournal.store.ts
interface ActionJournalState {
  entries: ActionJournalEntry[]   // session only, not persisted
  addEntry: (entry: Omit<ActionJournalEntry, 'id' | 'timestamp'>) => void
  setLlmExplanation: (id: string, text: string) => void
  clear: () => void
}
```

Limit: 50 entries per session (FIFO).

### Panel

The Journal is accessible via:
- A tab in the repo view (next to History / Working Tree)
- An "Open in Journal" button in post-action toasts (Feature 5)
- A link from the Git Console

### Activation

Toggle `showActionJournal` in the Settings Learning section. Enabled by default.

---

## Section: Learning (Settings)

New section in `SettingsPage`, positioned between "Language" and "Advanced".

```
┌─────────────────────────────────────────────────────────────┐
│  Learning                                                    │
│                                                             │
│  Learning mode:                                              │
│  ○ Disabled                                                 │
│  ○ Intermediate  (command + risk before each action)        │
│  ● Beginner       (full explanation)                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ☑ Git Console  (show commands in real time)                │
│  ☑ Pedagogical tooltips on actions                           │
│  ☑ Post-action summary (enriched toast)                     │
│  ☑ Action journal                                            │
│  ☐ Show the command before destructive actions               │
│    (disable if you are an advanced user)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### New settings

| Setting | Type | Default |
|-----------|------|--------|
| `learningMode` | `'off' \| 'beginner' \| 'intermediate'` | `'off'` |
| `showGitConsole` | boolean | `false` |
| `showPedagogicTooltips` | boolean | `true` |
| `showPostActionSummary` | boolean | `true` |
| `showActionJournal` | boolean | `true` |
| `skipCommandPreview` | boolean | `false` |

---

## Overall architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Rust (commands/)                                               │
│  Each command emits git:command after resolution                │
│                                                                 │
│  emit("git:command", GitCommandEvent { cmd, ok, duration... }) │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Tauri event
┌───────────────────────────▼─────────────────────────────────────┐
│  Frontend                                                       │
│                                                                 │
│  useConsoleStore ◄── listen("git:command")                     │
│  useActionJournalStore ◄── fed by action hooks                 │
│                                                                 │
│  <GitConsolePanel>     Feature 1                               │
│  <ActionTooltip>       Feature 2                               │
│  <CommandPreview>      Feature 3  (injected into modals)       │
│  <GitTerm>             Feature 4                               │
│  <PostActionToast>     Feature 5  (replaces the standard toast) │
│  <ActionGuardPanel>    Feature 6                               │
│  <ActionJournalPanel>  Feature 7                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## New files

### Frontend

```
apps/desktop/src/
├── stores/
│   ├── console.store.ts          # Feature 1 — git console entries
│   └── actionJournal.store.ts    # Feature 7 — session journal
├── hooks/
│   ├── useGitConsole.ts          # Feature 1 — subscribes to git:command
│   └── useActionGuard.ts         # Feature 6 — intercept pre-action
├── components/pedagogy/
│   ├── GitConsolePanel.tsx       # Feature 1
│   ├── ActionTooltip.tsx         # Feature 2
│   ├── CommandPreview.tsx        # Feature 3
│   ├── ActionGuardPanel.tsx      # Feature 6
│   ├── PostActionToast.tsx       # Feature 5
│   └── ActionJournalPanel.tsx    # Feature 7
└── app/settings/
    └── LearningSettings.tsx      # Learning section

packages/
├── ui/src/components/
│   └── GitTerm.tsx               # Feature 4 — inline glossary
└── i18n/
    ├── src/actionExplainMap.ts   # Feature 6 — pedagogical content
    └── locales/
        ├── fr/
        │   ├── action-tooltips.json  # Feature 2
        │   └── git-glossary.json     # Feature 4
        └── en/
            ├── action-tooltips.json
            └── git-glossary.json
```

### Rust (addition to existing commands)

```rust
// Addition to each existing command (commands/*.rs)
app_handle.emit("git:command", GitCommandEvent {
    cmd: format!("git commit -m {:?}", message),
    timestamp: unix_ms(),
    duration_ms: elapsed,
    ok: true,
    error: None,
}).ok();
```

```rust
// models.rs — new type
#[derive(Clone, serde::Serialize)]
pub struct GitCommandEvent {
    pub cmd: String,
    pub timestamp: u64,
    pub duration_ms: u64,
    pub ok: bool,
    pub error: Option<String>,
}
```

---

## i18n keys (new keys)

```json
{
  "settings.sections.learning": "Apprentissage",
  "settings.learning.mode": "Mode apprentissage",
  "settings.learning.mode.off": "Désactivé",
  "settings.learning.mode.beginner": "Débutant",
  "settings.learning.mode.intermediate": "Intermédiaire",
  "settings.learning.console": "Console Git",
  "settings.learning.tooltips": "Tooltips pédagogiques sur les actions",
  "settings.learning.postAction": "Résumé post-action",
  "settings.learning.journal": "Journal des actions",
  "settings.learning.skipPreview": "Afficher la commande avant les actions destructives",
  "console.title": "Console Git",
  "console.clear": "Effacer",
  "journal.title": "Journal des actions",
  "journal.clear": "Effacer",
  "journal.explain": "Expliquer avec Ollama",
  "journal.explaining": "Explication en cours...",
  "journal.empty": "Aucune action effectuée dans cette session.",
  "postAction.commands": "Voir les commandes",
  "postAction.openJournal": "Ouvrir dans le Journal"
}
```
