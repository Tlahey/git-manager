# Spec 14 — Suivi d'exécution du refactor architecture

## Objectif

Ce fichier est le **tableau de bord vivant** du plan décrit dans
[13-architecture-refactor-plan.md](13-architecture-refactor-plan.md). Il découpe chaque phase en
actions atomiques (une action = une PR raisonnable), dans l'ordre où elles doivent être faites
(certaines dépendent des précédentes — ne pas sauter l'ordre sans vérifier la colonne "Dépend de").

**Règle d'usage :** à chaque session de travail sur le refactor, mettre à jour ce fichier —
cocher les actions terminées, ajouter une ligne dans le Journal en bas avec la date. Ce fichier
doit toujours refléter l'état réel du code, pas l'intention.

## Légende de statut

| Symbole | Sens |
|---|---|
| ⬜ | Pas commencé |
| 🔄 | En cours |
| ✅ | Terminé |
| ⏭️ | Reporté / hors scope pour l'instant |

---

## Phase 1 — Quick wins (backend)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 1.1 | Créer `models.rs` avec `GitDiffLine`/`GitDiffHunk`/`GitDiffFile`/`GitDiff` comme unique définition (noms alignés sur `packages/git-types`, qui utilisait déjà ces noms côté TS) | `src-tauri/src/models.rs` | — | ✅ |
| 1.2 | Remplacer la redéfinition de ces structs dans `commit.rs` par un import de `models.rs` | `commands/commit.rs` | 1.1 | ✅ |
| 1.3 | Remplacer la redéfinition de ces structs dans `log.rs` par un import de `models.rs` (au passage : `CommitDiff` renommé `GitDiff` — c'était déjà le type attendu côté TS, l'ancien nom Rust était juste incohérent) | `commands/log.rs` | 1.1 | ✅ |
| 1.4 | Créer `utils.rs` avec `short_oid()` | `src-tauri/src/utils.rs` | — | ✅ |
| 1.5 | Remplacer les occurrences dupliquées de shortening SHA par `short_oid()` (7 sites trouvés en réalité, pas 4 : `rollback.rs` x2, `commit.rs`, `remote.rs`, `log.rs`, `fixup.rs` x2) | `rollback.rs`, `remote.rs`, `log.rs`, `commit.rs`, `fixup.rs` | 1.4 | ✅ |
| 1.6 | Ajouter `get_git_signature()` dans `utils.rs` et remplacer les usages dupliqués (4 sites trouvés : `rollback.rs`, `commit.rs`, `stash.rs`, `fixup.rs`) | `utils.rs`, `rollback.rs`, `commit.rs`, `stash.rs`, `fixup.rs` | 1.4 | ✅ |

## Phase 1 — Quick wins (frontend)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 1.7 | Ajouter `getTerminalCommands()` dans `lib/tauri.ts`, l'exposer via `api/shell.api.ts` (domaine terminal, cohérent avec `apiOpenTerminal`) sous le nom `apiGetTerminalCommands()`, corriger `game.store.ts:228` pour ne plus appeler `invoke()` directement | `lib/tauri.ts`, `api/shell.api.ts`, `stores/game.store.ts` | — | ✅ |

## Phase 2 — Extraction de hooks (frontend, sans changement de comportement)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 2.1 | Extraire `hooks/useGithubDeviceFlow.ts` (polling, state, cleanup timers) depuis `GithubSection.tsx` | `hooks/useGithubDeviceFlow.ts`, `app/settings/components/GithubSection.tsx` | — | ⬜ |
| 2.2 | Extraire `hooks/useFileTree.ts` (Composite : `buildFileTree`, `computeFolderStats`, tri, filtrage) depuis `CommitFileList.tsx` | `hooks/useFileTree.ts`, `components/git-graph/components/CommitFileList.tsx` | — | ⬜ |
| 2.3 | Migrer `WipStagingPanel.tsx` pour consommer `hooks/useFileTree.ts` au lieu de sa propre logique d'arbre | `components/git-graph/components/WipStagingPanel.tsx` | 2.2 | ⬜ |
| 2.4 | Séparer `stores/repos.store.ts` en `stores/repoUI.store.ts` (onglets, panneau actif, diff sélectionné) et `stores/repoData.store.ts` (repo actif, WIP messages, stashes masqués) | `stores/repos.store.ts` → 2 fichiers + call sites | — | ⬜ |
| 2.5 *(optionnel)* | Séparer `stores/settings.store.ts` (préférences UI vs config métier Ollama/branches protégées/GitHub) si le store continue de grossir | `stores/settings.store.ts` | — | ⏭️ |

## Phase 3 — Service layer Rust (`commands/` → `services/`)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 3.1 | Extraire `services/git_diff.rs` (génération de diff, seule source utilisée par `commit.rs` et `log.rs`) | `services/git_diff.rs` | 1.1–1.3 | ⬜ |
| 3.2 | Extraire `services/git_graph.rs` avec un `GitGraphBuilder` (colonnes/couleurs/edges) hors de `log.rs` | `services/git_graph.rs`, `commands/log.rs` | 3.1 | ⬜ |
| 3.3 | Extraire `services/git_commit.rs` (stage/unstage/commit/discard) hors de `commit.rs` | `services/git_commit.rs`, `commands/commit.rs` | 3.1 | ⬜ |
| 3.4 | Unifier `build_git_repo()` / `open_repo()` dans `services/git_repo.rs` | `services/git_repo.rs`, `commands/repo.rs` | — | ⬜ |
| 3.5 | Vérifier que `commands/log.rs` et `commands/commit.rs` sont redescendus à ~150 lignes chacun (désérialisation + délégation + erreurs uniquement) | `commands/log.rs`, `commands/commit.rs` | 3.1–3.3 | ⬜ |

## Phase 4 — Bus d'événements généralisé (Observer)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 4.1 | Étendre `lib/gameObserver.ts` (ou créer `lib/appEventBus.ts`) avec des types d'événements au-delà de la gamification (`git:stage`, `git:commit`, `github:auth`, `remote:push`, ...) | `lib/gameObserver.ts` ou `lib/appEventBus.ts` | — | ⬜ |
| 4.2 | Créer `api/service.ts` avec le wrapper `callCommand()` qui appelle `invoke`/`lib/tauri.ts` puis notifie le bus | `api/service.ts` | 4.1 | ⬜ |
| 4.3 | Migrer `api/git.api.ts` pour passer par `callCommand()` | `api/git.api.ts` | 4.2 | ⬜ |
| 4.4 | Migrer les autres fichiers `api/*.api.ts` un par un (`github.api.ts`, `nativeMenu.api.ts`, `repo.api.ts`, `shell.api.ts`, `ssh.api.ts`, `theme.api.ts`, `ollama.api.ts`) | `api/*.api.ts` | 4.2 | ⬜ |

## Phase 5 — Strategy pour le rendu de diff

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 5.1 | Définir l'interface `DiffRenderStrategy` (texte split-view, binaire, image) | nouveau module côté `components/git-graph/` | Phase 2–4 stabilisées | ⬜ |
| 5.2 | Refactorer `DiffViewCenter.tsx` pour sélectionner/déléguer à la stratégie au lieu de `if/else` empilés | `components/git-graph/DiffViewCenter.tsx` | 5.1 | ⬜ |

---

## Étape courante

**Phase 1 terminée (backend + frontend).** **Prochaine action à faire : 2.1** — extraire
`hooks/useGithubDeviceFlow.ts` depuis `GithubSection.tsx`.

*(Mettre à jour cette ligne à chaque session : indiquer le numéro de la prochaine action non
terminée. Si plusieurs actions sont en parallèle, lister les numéros en cours.)*

---

## Journal

| Date | Action(s) | Notes |
|---|---|---|
| 2026-07-02 | Création du plan et du tracker | Audit initial effectué, phases 1-5 définies, aucune action de code appliquée encore |
| 2026-07-02 | 1.1, 1.2, 1.3 | Structs de diff unifiées dans `models.rs` (`GitDiffLine`/`GitDiffHunk`/`GitDiffFile`/`GitDiff`) ; `commit.rs` et `log.rs` importent désormais depuis `models.rs` au lieu de redéfinir. `CommitDiff` (log.rs) renommé `GitDiff` pour matcher le type déjà utilisé côté frontend (`packages/git-types`). Vérifié : `cargo build` et `cargo clippy` passent sans nouvelle erreur/warning. |
| 2026-07-02 | 1.4, 1.5, 1.6 | Créé `src-tauri/src/utils.rs` avec `short_oid()` et `get_git_signature()`. `short_oid()` remplace 7 réécritures (pas 4 comme estimé dans l'audit initial) dans `rollback.rs` (x2), `commit.rs`, `remote.rs`, `log.rs`, `fixup.rs` (x2). `get_git_signature()` remplace 4 réécritures dans `rollback.rs`, `commit.rs`, `stash.rs`, `fixup.rs`. Vérifié : `cargo build` et `cargo clippy` passent sans nouvelle erreur/warning. |
| 2026-07-02 | 1.7 | Ajouté `getTerminalCommands()` dans `lib/tauri.ts` + `apiGetTerminalCommands()` dans `api/shell.api.ts` ; `game.store.ts` n'appelle plus `invoke()` directement. Vérifié : `pnpm --filter @git-manager/desktop typecheck` passe. (`pnpm lint` échoue pour une raison préexistante sans rapport — `eslint.config.js` manquant, pas dans le scope de cette action.) **Phase 1 (backend + frontend) intégralement terminée.** |
