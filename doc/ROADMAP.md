# ROADMAP — git-manager

> Plan de développement itératif. Chaque milestone livre une valeur fonctionnelle indépendante.

---

## Statuts

| Icône | Signification |
|-------|--------------|
| ⬜ | Non démarré |
| 🔵 | En cours |
| ✅ | Terminé |
| 🚧 | Bloqué / bug connu |

---

## M0 — Fondations (Phase 0 + 1)

> **Objectif** : Monorepo opérationnel, application Tauri qui se lance, affichage d'un repo Git minimal.

| # | Tâche | Statut |
|---|-------|--------|
| 0.1 | Documentation (README, ROADMAP, 11 specs) | ✅ |
| 0.2 | Monorepo pnpm + Turborepo | ✅ |
| 0.3 | `packages/config` — ESLint + Tailwind + tsconfig partagés | ✅ |
| 0.4 | `packages/git-types` — interfaces TypeScript | ✅ |
| 0.5 | `packages/i18n` — react-i18next FR/EN | ✅ |
| 0.6 | `packages/ui` — shadcn/ui base components | ✅ |
| 0.7 | `apps/desktop` — Tauri v2 + Vite + React 18 | ✅ |
| 0.8 | Tauri commands de base : `open_repo`, `get_status`, `scan_repos` | ✅ |
| 0.9 | Scripts `pnpm dev` (frontend) / `pnpm dev:desktop` (Tauri complet) | ✅ |

**Critère de validation** : `pnpm dev:desktop` compile et lance l'app. ✅ (build Rust OK, build Vite OK)

> **⚠️ Bug connu** : L'ouverture d'un repo/dossier via le file picker ne fonctionne pas. À corriger en M0-fix avant de valider M1.

---

## M1 — Git Tree / MVP

> **Objectif** : Visualisation complète de l'historique Git avec branches, tags et détail de commit.

| # | Tâche | Statut |
|---|-------|--------|
| 1.1 | Tauri command `get_log` — historique paginé + layout graph | ✅ |
| 1.2 | Tauri command `get_branches` + `get_tags` + ahead/behind | ✅ |
| 1.3 | Tauri command `get_commit_diff` + `get_commit_file` | ✅ |
| 1.4 | Dashboard multi-repo (liste + ajout manuel + scan) | ✅ |
| 1.5 | Vue repo — sidebar branches/tags + onglets | ✅ |
| 1.6 | Git Graph — virtualisé, colonnes colorées, connexions | ✅ |
| 1.7 | Panneau détail commit — diff hunks, auteur, message | ✅ |
| 1.8 | RefLabels — badges colorés HEAD/branches/tags/remotes | ✅ |
| 1.9 | Filtres : branche, auteur, date, message | ✅ |
| 1.10 | Fix largeur graphe — SVG per-row (plus de crop sur les messages) | ✅ |
| 1.11 | Panneau commit redimensionnable (drag handle, min 250 / max 700 px) | ✅ |

**Critère de validation** : graphe git complet d'un repo, clic sur commit → diff visible. 🔵 (dépend du fix ouverture repo)

---

## M2 — Opérations de base

> **Objectif** : Stage/unstage, commit manuel, push/pull/fetch.

| # | Tâche | Statut |
|---|-------|--------|
| 2.1 | Vue "Working Tree" — fichiers staged/unstaged/untracked | ✅ |
| 2.2 | Stage / Unstage de fichiers individuels + stage all | ✅ |
| 2.3 | Diff preview des fichiers (staged et non stagés) | ✅ |
| 2.4 | Commit manuel (message + amend optionnel) | ✅ |
| 2.5 | Fetch / Pull (fast-forward) / Push avec auth SSH | ✅ |
| 2.6 | Sidebar branches avec ahead/behind + boutons Fetch/Pull/Push | ✅ |
| 2.7 | Polling statut working tree (3s) | ✅ |
| 2.8 | Gestion des conflits de merge (visualisation) | ⬜ |

**Critère de validation** : commit complet de A à Z depuis l'application. ✅

---

## M3 — Génération de commits IA + Settings

> **Objectif** : Génération du message de commit via Ollama + interface de configuration.

| # | Tâche | Statut |
|---|-------|--------|
| 3.1 | Client Ollama Rust — streaming `/api/generate` | ✅ |
| 3.2 | Hook `useOllamaGeneration` — accumulation tokens + annulation | ✅ |
| 3.3 | `CommitMessageBox` — bouton Générer + streaming affiché | ✅ |
| 3.4 | `useCommitMessageHistory` — 10 derniers messages (session) | ✅ |
| 3.5 | Dropdown historique dans `CommitMessageBox` | ✅ |
| 3.6 | `SettingsPage` — sections LLM / Git / Appearance / Language / Advanced | ✅ |
| 3.7 | Test de connexion Ollama depuis Settings | ✅ |
| 3.8 | Auto-save des settings via Zustand | ✅ |

**Critère de validation** : génération streaming < 10s, settings persistés. ✅

---

## M4 — Rollback & Fixup

> **Objectif** : Annulations sûres avec prévisualisation et protection.

| # | Tâche | Statut |
|---|-------|--------|
| 4.1 | `revert_commit` Rust — crée un commit d'annulation | ✅ |
| 4.2 | `reset_to_commit` Rust — soft / mixed / hard | ✅ |
| 4.3 | `get_commits_between` Rust — preview commits affectés | ✅ |
| 4.4 | `RevertDialog` — modal avec option "stage only" | ✅ |
| 4.5 | `ResetDialog` — soft/mixed/hard + confirmation `RESET` pour hard | ✅ |
| 4.6 | Actions Revert + Reset dans `CommitPanel` | ✅ |
| 4.7 | `create_fixup_commit` Rust | ✅ |
| 4.8 | `get_pending_fixups` + `autosquash_preview` + `run_autosquash` Rust | ✅ |
| 4.9 | `FixupTargetSelector` — sélecteur commit cible | ✅ |
| 4.10 | `AutosquashPreviewDialog` — aperçu groupé avant squash | ✅ |
| 4.11 | `PendingFixupsBanner` — bannière en tête du graphe | ✅ |
| 4.12 | Protection branche principale (configurable dans Settings) | ✅ |

**Critère de validation** : rollback + fixup + autosquash depuis l'UI. ✅

---

## M0-fix — Correctifs prioritaires 🚧

> Bugs bloquants à corriger avant de valider M1 en production.

| # | Tâche | Statut |
|---|-------|--------|
| F.1 | **Ouverture repo/dossier via file picker** — dialog Tauri ne déclenche pas l'ouverture | 🚧 |
| F.2 | **Authentification GitHub via OAuth provider** — remplacer nom/email par login GitHub OAuth (token) | ⬜ |

> **Note F.2** : L'authentification distante doit utiliser un OAuth provider (GitHub App ou Personal Access Token via secure storage Tauri), pas un nom/email en clair. À implémenter dans `commands/remote.rs` avec `tauri-plugin-store` pour le token, et un flow de login via `open()` vers `github.com/login/oauth`.

---

## M5 — Rebase interactif

> **Objectif** : Rebase interactif avec interface drag & drop.

| # | Tâche | Statut |
|---|-------|--------|
| 5.1 | Parsing du `git-rebase-todo` | ⬜ |
| 5.2 | UI liste drag & drop (pick/squash/reword/drop/edit/fixup) | ⬜ |
| 5.3 | Exécution rebase avec gestion des pauses (conflict, edit) | ⬜ |
| 5.4 | Prévisualisation du résultat avant exécution | ⬜ |
| 5.5 | Abort / Continue / Skip | ⬜ |

**Critère de validation** : rebase interactif complet depuis l'UI sans passer par le terminal.

---

## M5-UI — Left Sidebar complète (RepositorySidebar)

> **Objectif** : Sidebar gauche riche et redimensionnable, inspirée GitKraken. Voir spec complète : `doc/specs/12-left-sidebar.md`.

| # | Tâche | Statut |
|---|-------|--------|
| 12.1 | Types `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus` | ✅ |
| 12.2 | Commande Rust `list_submodules` (git2) | ✅ |
| 12.3 | Enregistrement Tauri + wrapper `listSubmodules` | ✅ |
| 12.4 | Hook `useSidebarResize` (drag, collapse, localStorage) | ✅ |
| 12.5 | Hook `useGroupedBranches` (préfixes, seuil ≥2) | ✅ |
| 12.6 | Hook `usePullRequests` (GitHub REST API, parse URL SSH/HTTPS) | ✅ |
| 12.7 | Composants atomiques (`SectionHeader`, `BranchItem`, `BranchFolder`, `PullRequestItem`) | ✅ |
| 12.8 | Section `LocalBranchesSection` (branches groupées par préfixe) | ✅ |
| 12.9 | Section `RemotesSection` (groupée par remote) | ✅ |
| 12.10 | Section `PullRequestsSection` (My PRs / All PRs + fallback non-GitHub) | ✅ |
| 12.11 | Section `TagsSection` | ✅ |
| 12.12 | Section `SubmodulesSection` | ✅ |
| 12.13 | `SidebarResizeHandle` + `RepositorySidebar` (conteneur principal) | ✅ |
| 12.14 | Intégration dans `RepoView.tsx` | ✅ |
| 12.15 | Effet hover-expand sur les noms de branches/tags/PRs longs | ✅ |
| 12.16 | Bouton collapse/expand avec transition CSS | ✅ |
| 12.17 | Vérification `pnpm typecheck` | ⬜ |
| 12.18 | Vérification `cargo build` | ⬜ |
| 12.19 | Menu contextuel branches (checkout/delete/rename/merge) | ⬜ |
| 12.20 | Modal "Créer une branche" depuis le bouton + | ⬜ |
| 12.21 | Token GitHub dans Settings pour repos privés | ⬜ |
| 12.22 | Capability Tauri pour `https://api.github.com` | ⬜ |

**Critère de validation** : sidebar affichée avec resize/collapse, branches groupées, PRs GitHub visibles.

---

## M5-UI-B — Top TabBar globale

> **Objectif** : Barre d'onglets globale type Chrome, persistante au-dessus de toutes les vues.

| # | Tâche | Statut |
|---|-------|--------|
| 13.1 | Store : `activeTab`, `setActiveTab`, constantes `DASHBOARD_TAB`/`PULL_REQUESTS_TAB`, sync `activeRepo` | ✅ |
| 13.2 | Onglet Accueil (Dashboard) épinglé, premier, non-fermable | ✅ |
| 13.3 | Onglet Pull Requests (vue transversale) épinglé, second | ✅ |
| 13.4 | Onglets repos fermables (style Chrome) | ✅ |
| 13.5 | Bouton `+` avec menu (Ouvrir / Cloner / Créer) | ✅ |
| 13.6 | Commande Rust `clone_repo` (git2 + auth SSH) + wrapper | ✅ |
| 13.7 | Commande Rust `init_repo` (git2) + wrapper | ✅ |
| 13.8 | `CloneRepoDialog` (URL + dossier parent) | ✅ |
| 13.9 | Engrenage Réglages à l'extrême droite | ✅ |
| 13.10 | Refacto `App.tsx` (routage par `activeTab`) + suppression barre interne `RepoView` | ✅ |
| 13.11 | `PullRequestsPage` (vue transversale, contenu initial) | ✅ |
| 13.12 | Onglets vues spécifiques (git graph, terminal, settings, kanban) | ⬜ |

**Critère de validation** : TabBar persistante, onglets Accueil/PR épinglés, repos ouvrables/fermables, bouton `+` fonctionnel (ouvrir/cloner/créer).

---

## M6 — Worktree & Branch management

> **Objectif** : Gestion visuelle des worktrees et des branches.

| # | Tâche | Statut |
|---|-------|--------|
| 6.1 | Liste des worktrees avec statut | ⬜ |
| 6.2 | Créer / supprimer / switcher un worktree | ⬜ |
| 6.3 | Créer / supprimer / renommer une branche | ⬜ |
| 6.4 | Merge (fast-forward / no-ff) avec prévisualisation | ⬜ |
| 6.5 | Compare branches — diff visuel | ⬜ |

---

## M7 — Stash & Polishing

> **Objectif** : Gestion des stashes + finitions UX.

| # | Tâche | Statut |
|---|-------|--------|
| 7.1 | Stash push avec message | ⬜ |
| 7.2 | Liste stashes avec prévisualisation diff | ⬜ |
| 7.3 | Stash pop / apply / drop | ⬜ |
| 7.4 | Keyboard shortcuts globaux | ⬜ |
| 7.5 | Notifications système (Tauri) | ⬜ |
| 7.6 | Mode dark / light toggle | ⬜ |
| 7.7 | Auto-update (Tauri updater) | ⬜ |

---

## M8 — Pédagogie & Mode apprentissage

> **Objectif** : Faire de git-manager une application qui instruite l'utilisateur. Chaque action peut être accompagnée de commandes git équivalentes, d'explications contextuelles et d'un LLM local pour tout décrypter.

| # | Tâche | Statut |
|---|-------|--------|
| 8.1 | `GitCommandEvent` Rust — struct + émission dans chaque command | ⬜ |
| 8.2 | `useConsoleStore` Zustand (session) + `useGitConsole` hook | ⬜ |
| 8.3 | `<GitConsolePanel>` — panel rétractable, style terminal | ⬜ |
| 8.4 | `<ActionTooltip>` — tooltip enrichi avec risque + commande | ⬜ |
| 8.5 | `action-tooltips.json` FR/EN — ~20 actions couvertes | ⬜ |
| 8.6 | `<CommandPreview>` — injection dans les modales destructives existantes | ⬜ |
| 8.7 | `<GitTerm>` — composant glossaire inline | ⬜ |
| 8.8 | `git-glossary.json` FR/EN — ~35 termes | ⬜ |
| 8.9 | `<PostActionToast>` — toast enrichi avec commandes collapsées | ⬜ |
| 8.10 | `useActionGuard` hook + `<ActionGuardPanel>` — mode apprentissage | ⬜ |
| 8.11 | `actionExplainMap.ts` — contenu pédagogique FR/EN par action | ⬜ |
| 8.12 | `useActionJournalStore` Zustand (session) | ⬜ |
| 8.13 | `<ActionJournalPanel>` — historique session + rendu markdown | ⬜ |
| 8.14 | Explication LLM dans le Journal via `useOllamaGeneration` | ⬜ |
| 8.15 | `LearningSettings.tsx` — nouvelle section dans SettingsPage | ⬜ |

**Critère de validation** : console git visible, journal avec explication Ollama fonctionnelle, mode apprentissage débutant actif sur reset --hard.

---

## Backlog (post-M8)

- Intégration GitHub / GitLab (PRs, Issues en overlay)
- Cherry-pick interactif
- Blame / Annotate
- Hooks Git visuels
- Export rapport d'activité
- Support OpenAI / Anthropic en plus d'Ollama
- Extension VSCode (panel embarqué)

---

## Dépendances entre milestones

```
M0 → M0-fix → M1 → M2 → M3
                         ↘ M4 → M5
                         ↘ M6
                         ↘ M7
                         ↘ M8  (dépend de M3 pour le Journal LLM)
```

M3, M4, M5, M6, M7, M8 peuvent être développés en parallèle après M2. M8 nécessite M3 uniquement pour la feature Journal + LLM.

---

## M0 — Fondations (Phase 0 + 1)

> **Objectif** : Monorepo opérationnel, application Tauri qui se lance, affichage d'un repo Git minimal.

| # | Tâche | Statut |
|---|-------|--------|
| 0.1 | Documentation (README, ROADMAP, specs) | 🔵 |
| 0.2 | Monorepo pnpm + Turborepo | ⬜ |
| 0.3 | `packages/config` — ESLint + Tailwind partagés | ⬜ |
| 0.4 | `packages/git-types` — interfaces TypeScript | ⬜ |
| 0.5 | `packages/i18n` — react-i18next FR/EN | ⬜ |
| 0.6 | `packages/ui` — shadcn/ui base | ⬜ |
| 0.7 | `apps/desktop` — Tauri v2 + Vite + React | ⬜ |
| 0.8 | Tauri commands de base : `open_repo`, `get_status` | ⬜ |

**Critère de validation** : `pnpm dev` lance l'app, on peut ouvrir un dossier Git et voir son statut.

---

## M1 — Git Tree / MVP (Phase 2 + 3)

> **Objectif** : Visualisation complète de l'historique Git avec branches, tags et détail de commit.

| # | Tâche | Statut |
|---|-------|--------|
| 1.1 | Tauri command `get_log` — historique paginé | ⬜ |
| 1.2 | Tauri command `get_branches` + `get_tags` | ⬜ |
| 1.3 | Tauri command `get_remotes` | ⬜ |
| 1.4 | Tauri command `get_diff` — diff d'un commit | ⬜ |
| 1.5 | Dashboard multi-repo (liste + ajout manuel + scan) | ⬜ |
| 1.6 | Vue repo — sidebar branches/tags + onglets | ⬜ |
| 1.7 | Git Graph — visualisation arbre (react-gitgraph) | ⬜ |
| 1.8 | Panneau détail commit — diff, auteur, message | ⬜ |
| 1.9 | Filtres : branche, auteur, date, message | ⬜ |
| 1.10 | Support SSH + HTTPS pour `fetch` / statut remote | ⬜ |

**Critère de validation** : on voit le graphe git complet d'un repo, on peut cliquer sur un commit et voir son diff.

---

## M2 — Opérations de base (Phase 4a)

> **Objectif** : Stage/unstage, commit manuel, push/pull/fetch.

| # | Tâche | Statut |
|---|-------|--------|
| 2.1 | Vue "Working Tree" — fichiers modifiés, staged, untracked | ⬜ |
| 2.2 | Stage / Unstage de fichiers et hunks | ⬜ |
| 2.3 | Commit manuel (message + options) | ⬜ |
| 2.4 | Push / Pull / Fetch avec gestion des conflits | ⬜ |
| 2.5 | Gestion des conflits de merge (visualisation) | ⬜ |

**Critère de validation** : on peut faire un commit complet de A à Z depuis l'application.

---

## M3 — Génération de commits IA (Phase 4b)

> **Objectif** : Génération du message de commit depuis le diff via Ollama.

| # | Tâche | Statut |
|---|-------|--------|
| 3.1 | Client Ollama (Rust) — appel HTTP `/api/generate` | ⬜ |
| 3.2 | Prompt engineering diff → conventional commit | ⬜ |
| 3.3 | UI : bouton "Générer", résultat éditable | ⬜ |
| 3.4 | Support du streaming (réponse token par token) | ⬜ |
| 3.5 | Configuration modèle dans Settings | ⬜ |
| 3.6 | Historique des messages générés (session) | ⬜ |

**Critère de validation** : diff sélectionné → clic "Générer" → message conventional commit affiché en < 10s avec Ollama local.

---

## M4 — Rollback & Fixup (Phase 4c)

> **Objectif** : Annulations sûres avec prévisualisation et protection.

| # | Tâche | Statut |
|---|-------|--------|
| 4.1 | Rollback — `git revert` avec prévisualisation | ⬜ |
| 4.2 | Reset soft / mixed / hard avec confirmation | ⬜ |
| 4.3 | Fixup — `git commit --fixup` sélecteur de cible | ⬜ |
| 4.4 | Autosquash — `git rebase --autosquash` | ⬜ |
| 4.5 | Protection branche principale (configurable) | ⬜ |

**Critère de validation** : rollback + fixup d'un commit avec confirmation et retour visuel dans le graph.

---

## M5 — Rebase interactif (Phase 4d)

> **Objectif** : Rebase interactif avec interface drag & drop.

| # | Tâche | Statut |
|---|-------|--------|
| 5.1 | Parsing du `git-rebase-todo` | ⬜ |
| 5.2 | UI liste drag & drop (pick/squash/reword/drop/edit/fixup) | ⬜ |
| 5.3 | Exécution rebase avec gestion des pauses (conflict, edit) | ⬜ |
| 5.4 | Prévisualisation du résultat avant exécution | ⬜ |
| 5.5 | Abort / Continue / Skip | ⬜ |

**Critère de validation** : rebase interactif complet depuis l'UI sans passer par le terminal.

---

## M6 — Worktree & Branch management (Phase 4e)

> **Objectif** : Gestion visuelle des worktrees et des branches.

| # | Tâche | Statut |
|---|-------|--------|
| 6.1 | Liste des worktrees avec statut | ⬜ |
| 6.2 | Créer / supprimer / switcher un worktree | ⬜ |
| 6.3 | Créer / supprimer / renommer une branche | ⬜ |
| 6.4 | Merge (fast-forward / no-ff) avec prévisualisation | ⬜ |
| 6.5 | Compare branches — diff visuel | ⬜ |

---

## M7 — Stash & Polishing (Phase 4f)

> **Objectif** : Gestion des stashes + finitions UX.

| # | Tâche | Statut |
|---|-------|--------|
| 7.1 | Stash push avec message | ⬜ |
| 7.2 | Liste stashes avec prévisualisation diff | ⬜ |
| 7.3 | Stash pop / apply / drop | ⬜ |
| 7.4 | Keyboard shortcuts globaux | ⬜ |
| 7.5 | Notifications système (Tauri) | ⬜ |
| 7.6 | Mode dark / light toggle | ⬜ |
| 7.7 | Auto-update (Tauri updater) | ⬜ |

---

## M8 — Pédagogie & Mode apprentissage (Phase 5)

> **Objectif** : Faire de git-manager une application qui instruite l'utilisateur. Console git en temps réel, explications contextuelles, journal de session avec explication LLM.

| # | Tâche | Statut |
|---|-------|--------|
| 8.1 | `GitCommandEvent` Rust — struct + émission dans chaque command | ⬜ |
| 8.2 | `useConsoleStore` Zustand (session) + `useGitConsole` hook | ⬜ |
| 8.3 | `<GitConsolePanel>` — panel rétractable, style terminal | ⬜ |
| 8.4 | `<ActionTooltip>` — tooltip enrichi avec risque + commande | ⬜ |
| 8.5 | `action-tooltips.json` FR/EN — ~20 actions couvertes | ⬜ |
| 8.6 | `<CommandPreview>` — injection dans les modales destructives existantes | ⬜ |
| 8.7 | `<GitTerm>` — composant glossaire inline | ⬜ |
| 8.8 | `git-glossary.json` FR/EN — ~35 termes | ⬜ |
| 8.9 | `<PostActionToast>` — toast enrichi avec commandes collapsées | ⬜ |
| 8.10 | `useActionGuard` hook + `<ActionGuardPanel>` — mode apprentissage | ⬜ |
| 8.11 | `actionExplainMap.ts` — contenu pédagogique FR/EN par action | ⬜ |
| 8.12 | `useActionJournalStore` Zustand (session) | ⬜ |
| 8.13 | `<ActionJournalPanel>` — historique session + rendu markdown | ⬜ |
| 8.14 | Explication LLM dans le Journal via `useOllamaGeneration` | ⬜ |
| 8.15 | `LearningSettings.tsx` — nouvelle section dans SettingsPage | ⬜ |

**Critère de validation** : console git visible, journal avec explication Ollama fonctionnelle, mode apprentissage débutant actif sur reset --hard.

---

## Backlog (post-M8)

- Intégration GitHub / GitLab (PRs, Issues en overlay)
- Cherry-pick interactif
- Blame / Annotate
- Hooks Git visuels
- Export rapport d'activité
- Support OpenAI / Anthropic en plus d'Ollama
- Extension VSCode (panel embarqué)

---

## Dépendances entre milestones

```
M0 → M1 → M2 → M3
               ↘ M4 → M5
               ↘ M6
               ↘ M7
               ↘ M8  (dépend de M3 pour le Journal LLM)
```

M3, M4, M5, M6, M7, M8 peuvent être développés en parallèle après M2. M8 nécessite M3 uniquement pour la feature Journal + LLM.
