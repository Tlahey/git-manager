# Spec 11 — Pédagogie & Mode apprentissage

## Objectif

Faire de git-manager une application qui **instruite l'utilisateur** autant qu'elle l'aide. Chaque action peut être accompagnée d'explications contextuelles, de commandes git équivalentes, et d'une mémoire de session permettant de comprendre ce qu'il vient de se passer — avec le LLM local comme assistant pédagogique.

---

## Vue d'ensemble des features

```
Pédagogie
├── 1. Console Git             — commandes git équivalentes en temps réel
├── 2. Tooltips pédagogiques   — explication + risque sur chaque action
├── 3. Preview pré-destructive — commande exacte avant exécution risquée
├── 4. Glossaire Git inline    — survol d'un terme → définition
├── 5. Résumé post-action      — toast enrichi après chaque opération
├── 6. Mode apprentissage      — panneau explicatif avant exécution
└── 7. Journal des actions     — historique de session + explication LLM
```

Toutes ces features sont **optionnelles et configurables** depuis la section [Apprentissage](#section--apprentissage) des Settings.

---

## Feature 1 — Console Git

### Objectif

Permettre à l'utilisateur de voir en temps réel les commandes `git` exactes qui sont exécutées en arrière-plan, comme s'il les tapait lui-même dans un terminal.

### Interface

```
┌──────────────────────────────────────────────────────────────────────┐
│  Console Git                                             [✕ Fermer]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  14:32:01  ✓  git fetch origin                           (320ms)    │
│  14:32:04  ✓  git commit -m "feat: add login page"       (45ms)     │
│  14:32:08  ✗  git push origin main                       (1.2s)     │
│               error: failed to push — remote contains work you do   │
│               not have locally                                       │
│                                                                      │
│                                              [Effacer]               │
└──────────────────────────────────────────────────────────────────────┘
```

La console s'affiche dans un panel rétractable en bas de la vue repo (comme un terminal intégré).

### Comportement

- **Activation** : bouton dans la toolbar du repo ou raccourci `⌘+Shift+L`
- **Persistance** : l'état ouvert/fermé est sauvegardé dans `settings.showGitConsole`
- **Entrées** : chaque entrée contient `timestamp | statut | commande | durée`
- **Erreurs** : en cas d'échec, la sortie d'erreur est affichée en rouge sur la ligne suivante (collapsée, dépliable)
- **Scroll** : auto-scroll vers le bas à chaque nouvelle entrée
- **Limite** : 100 entrées conservées (session uniquement, non persisté)
- **Effacer** : bouton "Effacer" vide la liste en session

### Architecture

```
Rust (après résolution de la commande)
  → app_handle.emit("git:command", GitCommandEvent { ... })

Frontend
  → listen("git:command", handler)
  → useConsoleStore (Zustand, session)
  → <GitConsolePanel> dans <RepoView>
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

> **Note** : L'event est émis **après** résolution. La commande affichée est la reconstruction équivalente en CLI, pas l'appel libgit2 interne.

---

## Feature 2 — Tooltips pédagogiques

### Objectif

Chaque bouton d'action affiche, au survol, une explication de ce qu'il fait, le niveau de risque associé, et la commande git équivalente.

### Interface

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠️  Reset --hard                                           │
│                                                              │
│  Réinitialise HEAD à ce commit et efface définitivement      │
│  toutes les modifications non committées.                    │
│                                                              │
│  Risque :  🔴 Destructif — impossible à annuler             │
│  Commande : git reset --hard <commit-sha>                    │
└──────────────────────────────────────────────────────────────┘
```

### Niveaux de risque

| Niveau | Icône | Description |
|--------|-------|-------------|
| `safe` | `✅ Sûr` | Aucun effet sur l'historique ou les fichiers |
| `reversible` | `⚠️ Réversible` | Modifie l'historique mais annulable (revert, reflog) |
| `destructive` | `🔴 Destructif` | Perte de données possible, difficile à annuler |

### Composant

```tsx
// packages/ui/src/components/ActionTooltip.tsx
<ActionTooltip
  action="reset-hard"
  side="top"
>
  <Button variant="destructive">Reset --hard</Button>
</ActionTooltip>
```

Le contenu des tooltips est géré via `packages/i18n/locales/*/action-tooltips.json`.

### Activation

Toggle `showPedagogicTooltips` dans Settings section Apprentissage. Activé par défaut.

---

## Feature 3 — Preview de commande pré-destructive

### Objectif

Avant toute action risquée, intercaler un affichage explicite de la commande git qui va être lancée, en plus de la confirmation déjà existante.

### Actions concernées

| Action | Commande affichée |
|--------|------------------|
| `reset --hard` | `git reset --hard <sha>` |
| `rebase -i` | `git rebase -i <base>` |
| `push --force` | `git push --force origin <branche>` |
| `drop` (rebase) | `git rebase --drop <sha>` |
| `branch -D` | `git branch -D <nom>` |

### Interface (ajout dans les modales existantes)

```
┌──────────────────────────────────────────────────────────────┐
│  Confirmer le reset --hard                                   │
│                                                              │
│  Commande qui sera exécutée :                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  git reset --hard a1b2c3d                             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ⚠️  Les modifications non committées seront perdues.        │
│                                                              │
│  Tapez RESET pour confirmer : [          ]                  │
│                                          [Annuler] [Reset]  │
└──────────────────────────────────────────────────────────────┘
```

### Activation

Option `skipCommandPreview` dans Settings section Apprentissage. Désactivé par défaut (preview activée).

---

## Feature 4 — Glossaire Git inline

### Objectif

Permettre à l'utilisateur de comprendre les termes techniques Git directement dans l'interface, sans quitter l'application.

### Interface

Les termes techniques sont affichés avec un **underline pointillé**. Au survol :

```
  Le rebase interactif permet de…
       ───────────────
       ↓
┌──────────────────────────────────────────┐
│  rebase                                  │
│                                          │
│  Rejoue une série de commits sur une     │
│  nouvelle base. Réécrit l'historique.    │
│                                          │
│  📖 Documentation git                   │
└──────────────────────────────────────────┘
```

### Composant

```tsx
// packages/ui/src/components/GitTerm.tsx
<GitTerm term="rebase" />
<GitTerm term="HEAD" />
<GitTerm term="staging-area" />
```

### Dictionnaire

Fichier `packages/i18n/locales/*/git-glossary.json` — environ 35 termes :

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

### Utilisation

Principalement dans le Mode apprentissage (Feature 6) et le Journal des actions (Feature 7). Peut être utilisé ponctuellement dans les descriptions de l'interface.

---

## Feature 5 — Résumé post-action

### Objectif

Après chaque opération majeure, afficher un toast enrichi qui explique ce qui vient de se passer en langage naturel, avec les commandes équivalentes.

### Interface

```
┌──────────────────────────────────────────────────────┐
│  ✅  Commit créé avec succès                         │
│                                                      │
│  2 fichiers commités sur main (feat: add login)      │
│                                                      │
│  ▶ Voir les commandes (2)                            │
│    git add src/login.tsx src/auth.ts                 │
│    git commit -m "feat: add login"                   │
│                                                      │
│  ▶ Ouvrir dans le Journal                            │
└──────────────────────────────────────────────────────┘
```

Le détail des commandes est **collapsé par défaut** et dépliable. Le toast disparaît après 6 secondes ou au clic.

### Actions couvertes

- Commit, amend
- Push, pull, fetch
- Reset (soft / mixed / hard)
- Revert
- Rebase interactif
- Stash push / pop / drop
- Création / suppression de branche
- Création / suppression de worktree
- Fixup / autosquash

### Activation

Toggle `showPostActionSummary` dans Settings section Apprentissage. Activé par défaut.

---

## Feature 6 — Mode apprentissage

### Objectif

Proposer un mode où, avant d'exécuter une action, un panneau s'affiche avec une explication contextuelle adaptée au niveau de l'utilisateur (débutant ou intermédiaire).

### Niveaux

| Niveau | Description |
|--------|-------------|
| `off` | Désactivé — comportement standard |
| `beginner` | Explication narrative complète, risques détaillés, alternatives suggérées |
| `intermediate` | Compact — commande + risque uniquement |

### Interface — niveau `beginner`

```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ️  À propos du Reset --hard                                   │
│                                                                 │
│  Vous êtes sur le point d'effectuer un reset --hard.           │
│                                                                 │
│  Ce que ça fait :                                               │
│  Git va déplacer HEAD au commit a1b2c3d et effacer             │
│  définitivement toutes les modifications non committées         │
│  dans vos fichiers.                                             │
│                                                                 │
│  ⚠️  Risque : Vos modifications seront perdues.                │
│                                                                 │
│  Alternatives plus sûres :                                      │
│  → git stash     (mettre de côté sans perdre)                  │
│  → git reset --soft (conserver les fichiers modifiés)          │
│                                                                 │
│  Commande : git reset --hard a1b2c3d                           │
│                                                                 │
│             [Ne plus afficher pour cette action]               │
│                               [Annuler]  [Exécuter quand même] │
└─────────────────────────────────────────────────────────────────┘
```

### Interface — niveau `intermediate`

```
┌────────────────────────────────────────────────────┐
│  git reset --hard a1b2c3d                          │
│  🔴 Destructif                                    │
│                       [Annuler]  [Exécuter]        │
└────────────────────────────────────────────────────┘
```

### Architecture

Le contenu pédagogique est un dictionnaire statique dans `packages/i18n` :

```typescript
// packages/i18n/src/actionExplainMap.ts
export type ActionExplain = {
  titleKey: string
  descriptionKey: string   // narrative
  risk: 'safe' | 'reversible' | 'destructive'
  commandTemplate: string  // avec placeholders
  alternativesKeys?: string[]
}

export const actionExplainMap: Record<string, ActionExplain> = {
  'reset-hard': { ... },
  'rebase-interactive': { ... },
  'push-force': { ... },
  // ...
}
```

Chaque action concernée expose un hook `useActionGuard(actionId, params)` qui retourne `{ shouldShow, proceed, cancel }`.

### Activation

Toggle `learningMode: 'off' | 'beginner' | 'intermediate'` dans Settings section Apprentissage.

---

## Feature 7 — Journal des actions

### Objectif

Conserver un **historique de session** de toutes les opérations effectuées, sous forme de documents lisibles, et permettre à l'utilisateur de demander une explication détaillée au LLM local (Ollama).

### Interface — panneau Journal

```
┌──────────────────────────────────────────────────────────────────────┐
│  Journal des actions                                    [Effacer]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ▶ 14:32 — Commit "feat: add login page"                            │
│  ▼ 14:28 — Fetch origin                                             │
│  │                                                                   │
│  │  Repo    : my-app                                                 │
│  │  Branche : main                                                   │
│  │  Résultat: 2 nouvelles branches, HEAD inchangé                   │
│  │                                                                   │
│  │  Commandes :                                                      │
│  │    git fetch origin                                               │
│  │                                                                   │
│  │  [✨ Expliquer avec Ollama]                                       │
│  │                                                                   │
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  │  La commande fetch récupère les métadonnées du remote sans       │
│  │  modifier votre branche locale. Ici, deux nouvelles branches     │
│  │  ont été découvertes (feature/auth, fix/typo). Votre HEAD        │
│  │  reste sur le même commit — aucun changement sur vos fichiers.   │
│  │                                                                   │
│  ▶ 14:25 — Reset --hard vers a1b2c3d                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Structure d'une entrée de journal

Chaque entrée est un objet structuré (généré côté frontend) :

```typescript
interface ActionJournalEntry {
  id: string               // uuid
  timestamp: number        // Unix ms
  actionType: string       // "commit" | "push" | "reset" | "rebase" | ...
  title: string            // résumé humain
  repo: string             // nom du repo
  branch: string           // branche courante
  commands: string[]       // commandes git équivalentes
  context: Record<string, string>  // avant/après : HEAD, nb fichiers...
  llmExplanation?: string  // streamé, ajouté après clic "Expliquer"
}
```

### Explication LLM

Le bouton **"Expliquer avec Ollama"** construit un prompt markdown à partir de l'entrée :

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

Ce prompt est envoyé à Ollama via `useOllamaGeneration` (déjà implémenté en M3). La réponse est streamée directement dans l'entrée du journal.

### Store

```typescript
// stores/actionJournal.store.ts
interface ActionJournalState {
  entries: ActionJournalEntry[]   // session uniquement, non persisté
  addEntry: (entry: Omit<ActionJournalEntry, 'id' | 'timestamp'>) => void
  setLlmExplanation: (id: string, text: string) => void
  clear: () => void
}
```

Limite : 50 entrées par session (FIFO).

### Panneau

Le Journal est accessible via :
- Un onglet dans la vue repo (à côté de Historique / Working Tree)
- Un bouton "Ouvrir dans le Journal" dans les toasts post-action (Feature 5)
- Lien depuis la Console Git

### Activation

Toggle `showActionJournal` dans Settings section Apprentissage. Activé par défaut.

---

## Section : Apprentissage (Settings)

Nouvelle section dans `SettingsPage`, positionnée entre "Langue" et "Avancé".

```
┌─────────────────────────────────────────────────────────────┐
│  Apprentissage                                              │
│                                                             │
│  Mode apprentissage :                                       │
│  ○ Désactivé                                               │
│  ○ Intermédiaire  (commande + risque avant chaque action)  │
│  ● Débutant       (explication complète)                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ☑ Console Git  (afficher les commandes en temps réel)     │
│  ☑ Tooltips pédagogiques sur les actions                   │
│  ☑ Résumé post-action (toast enrichi)                      │
│  ☑ Journal des actions                                     │
│  ☐ Afficher la commande avant les actions destructives     │
│    (désactiver si vous êtes un utilisateur avancé)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Nouveaux paramètres

| Paramètre | Type | Défaut |
|-----------|------|--------|
| `learningMode` | `'off' \| 'beginner' \| 'intermediate'` | `'off'` |
| `showGitConsole` | boolean | `false` |
| `showPedagogicTooltips` | boolean | `true` |
| `showPostActionSummary` | boolean | `true` |
| `showActionJournal` | boolean | `true` |
| `skipCommandPreview` | boolean | `false` |

---

## Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│  Rust (commands/)                                               │
│  Chaque commande émet git:command après résolution             │
│                                                                 │
│  emit("git:command", GitCommandEvent { cmd, ok, duration... }) │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Tauri event
┌───────────────────────────▼─────────────────────────────────────┐
│  Frontend                                                       │
│                                                                 │
│  useConsoleStore ◄── listen("git:command")                     │
│  useActionJournalStore ◄── alimenté par les hooks d'action     │
│                                                                 │
│  <GitConsolePanel>     Feature 1                               │
│  <ActionTooltip>       Feature 2                               │
│  <CommandPreview>      Feature 3  (injecté dans les modales)   │
│  <GitTerm>             Feature 4                               │
│  <PostActionToast>     Feature 5  (remplace le toast standard) │
│  <ActionGuardPanel>    Feature 6                               │
│  <ActionJournalPanel>  Feature 7                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Nouveaux fichiers

### Frontend

```
apps/desktop/src/
├── stores/
│   ├── console.store.ts          # Feature 1 — entrées console git
│   └── actionJournal.store.ts    # Feature 7 — journal de session
├── hooks/
│   ├── useGitConsole.ts          # Feature 1 — subscribe à git:command
│   └── useActionGuard.ts         # Feature 6 — intercept pre-action
├── components/pedagogy/
│   ├── GitConsolePanel.tsx       # Feature 1
│   ├── ActionTooltip.tsx         # Feature 2
│   ├── CommandPreview.tsx        # Feature 3
│   ├── ActionGuardPanel.tsx      # Feature 6
│   ├── PostActionToast.tsx       # Feature 5
│   └── ActionJournalPanel.tsx    # Feature 7
└── app/settings/
    └── LearningSettings.tsx      # Section Apprentissage

packages/
├── ui/src/components/
│   └── GitTerm.tsx               # Feature 4 — glossaire inline
└── i18n/
    ├── src/actionExplainMap.ts   # Feature 6 — contenu pédagogique
    └── locales/
        ├── fr/
        │   ├── action-tooltips.json  # Feature 2
        │   └── git-glossary.json     # Feature 4
        └── en/
            ├── action-tooltips.json
            └── git-glossary.json
```

### Rust (ajout dans les commandes existantes)

```rust
// Ajout dans chaque commande existante (commands/*.rs)
app_handle.emit("git:command", GitCommandEvent {
    cmd: format!("git commit -m {:?}", message),
    timestamp: unix_ms(),
    duration_ms: elapsed,
    ok: true,
    error: None,
}).ok();
```

```rust
// models.rs — nouveau type
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

## i18n keys (nouvelles clés)

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
