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
| ⏭️ | Hors scope / ne sera pas fait (justifié) |
| ⏸️ | Reporté à une prochaine session (à reprendre plus tard, pas abandonné) |

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
| 2.1 | Extraire `hooks/useGithubDeviceFlow.ts` (polling, state, cleanup timers) depuis `GithubSection.tsx` | `hooks/useGithubDeviceFlow.ts`, `app/settings/components/GithubSection.tsx` | — | ✅ |
| 2.2 | Extraire `hooks/useFileTree.ts` (Composite : `buildFileTree`, `computeFolderStats`, tri, filtrage, état expand/collapse) depuis `CommitFileList.tsx` | `hooks/useFileTree.ts`, `components/git-graph/components/CommitFileList.tsx` | — | ✅ |
| 2.3 | ~~Migrer `WipStagingPanel.tsx` vers `hooks/useFileTree.ts`~~ — **re-scopé, pas applicable** : en relisant `WipStagingPanel.tsx`, il n'a pas d'arbre récursif dupliqué. Son `wipBatches` (useMemo) fait un simple regroupement plat par dossier racine pour le mode "batch commit", un besoin différent du Composite imbriqué de `CommitFileList`. L'audit initial avait surestimé la duplication ici — rien à migrer. | `components/git-graph/components/WipStagingPanel.tsx` | 2.2 | ⏭️ |
| 2.4 | Séparer `stores/repos.store.ts` en `stores/repoUI.store.ts` (onglets, `activeRepo`/`activeTab` de navigation, diff sélectionné, panneau gauche, `editingOid`) et `stores/repoData.store.ts` (`savedRepos`, `discoveredRepos`, `repoCache`, `wipMessages`, `hiddenStashes`) | `stores/repos.store.ts` → 2 fichiers + 22 call sites | — | ✅ |
| 2.5 *(optionnel)* | Séparer `stores/settings.store.ts` (préférences UI vs config métier Ollama/branches protégées/GitHub) si le store continue de grossir | `stores/settings.store.ts` | — | ⏭️ |

## Phase 3 — Service layer Rust (`commands/` → `services/`)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 3.1 | Extraire `services/git_diff.rs` (génération de diff, seule source utilisée par `commit.rs` et `log.rs`) | `services/git_diff.rs` | 1.1–1.3 | ✅ |
| 3.3 | Extraire `services/git_commit.rs` (stage/unstage/commit/discard) hors de `commit.rs` | `services/git_commit.rs`, `commands/commit.rs` | 3.1 | ✅ |
| 3.4 | Unifier `build_git_repo()` / `open_repo()` dans `services/git_repo.rs` | `services/git_repo.rs`, `commands/repo.rs` | — | ✅ |
| 3.2 | Extraire `services/git_graph.rs` avec un `GitGraphBuilder` (colonnes/couleurs/edges) hors de `log.rs` | `services/git_graph.rs`, `commands/log.rs` | 3.1 | ⏸️ reporté — voir note |
| 3.5 | Vérifier que `commands/log.rs` et `commands/commit.rs` sont redescendus à ~150 lignes chacun (désérialisation + délégation + erreurs uniquement) | `commands/log.rs`, `commands/commit.rs` | 3.1–3.3 | 🔄 partiel — voir note |

## Phase 4 — Bus d'événements généralisé (Observer)

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 4.1 | Renommer `lib/gameObserver.ts` → `lib/appEventBus.ts` (`GameEvent`/`GameListener` → `AppEvent`/`AppEventListener`, même impl pub/sub), mettre à jour les 3 consommateurs (`App.tsx`, `PullRequestsPage.tsx`, `game.store.ts`) | `lib/appEventBus.ts`, `App.tsx`, `app/pull-requests/PullRequestsPage.tsx`, `stores/game.store.ts` | — | ✅ |
| 4.2 | Créer `api/service.ts` avec le wrapper `callCommand(event, fn, payload?)` qui appelle `fn()` puis notifie `appEventBus` | `api/service.ts` | 4.1 | ✅ |
| 4.3 | Migrer les 8 sites de `api/git.api.ts` qui notifiaient déjà `gameObserver` (stage/unstage/stageAll/unstageAll/commit/discard/fixup/autosquash) vers `callCommand()`, en ne wrappant que l'appel `invoke` (pas la logique undo/redo autour, qui reste inchangée) | `api/git.api.ts` | 4.2 | ✅ |
| 4.4 | ~~Migrer les autres fichiers `api/*.api.ts`~~ — **re-scopé, pas applicable pour l'instant** : `github.api.ts`, `nativeMenu.api.ts`, `repo.api.ts`, `shell.api.ts`, `ssh.api.ts`, `theme.api.ts`, `ollama.api.ts` ne notifient rien aujourd'hui. Les faire passer par `callCommand` avec un événement inutilisé aurait été de l'indirection sans bénéfice. À faire le jour où l'un d'eux a un événement réel à notifier — `callCommand`/`appEventBus` sont déjà prêts à l'accueillir sans modification. | `api/*.api.ts` | 4.2 | ⏭️ |

## Phase 5 — Strategy pour le rendu de diff

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 5.1 | Définir l'interface `DiffRenderStrategy` (texte split-view, binaire, image) | nouveau module côté `components/git-graph/` | Phase 2–4 stabilisées | ⬜ |
| 5.2 | Refactorer `DiffViewCenter.tsx` pour sélectionner/déléguer à la stratégie au lieu de `if/else` empilés | `components/git-graph/DiffViewCenter.tsx` | 5.1 | ⬜ |

---

## Étape courante

**Phase 2 : 2.1/2.2/2.4 terminées, 2.3 non applicable (⏭️), 2.5 optionnelle (reportée).**
**Phase 3 : 3.1/3.3/3.4 terminées.** **3.2 (GitGraphBuilder) reportée (⏸️)** — c'est le seul
morceau vraiment risqué qui reste : ~350 lignes d'algorithme de layout de colonnes/couleurs/edges
dans `get_log` (`commands/log.rs`), sans suite de tests et sans moyen de vérifier visuellement le
rendu du graphe depuis cet environnement. À faire dans une session où l'app peut être testée
manuellement juste après (`pnpm dev`, vérifier le rendu du graphe avec plusieurs branches/merges).
**Phase 4 : 4.1/4.2/4.3 terminées, 4.4 non applicable pour l'instant (⏭️).**
**Prochaine action à faire : 3.2** (si testable) ou **Phase 5** (Strategy pour `DiffViewCenter.tsx`)
en attendant.

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
| 2026-07-02 | 2.1 | Créé `hooks/useGithubDeviceFlow.ts` (device code, polling, cleanup timer via `useRef`, `completeLoginWithToken` partagé OAuth/PAT) réutilisant le type `DeviceCodeResponse` déjà exporté par `lib/tauri.ts` plutôt que d'en redéfinir un. `GithubSection.tsx` passe de 562 à 465 lignes, ne garde que l'état UI (loginMethod, patToken, copied) et le rendu. Comportement préservé à l'identique (mêmes messages d'erreur, mêmes resets). Vérifié : `pnpm typecheck` passe. Pas de test manuel du flow OAuth dans l'app (Tauri, non testable en navigateur) — à vérifier manuellement par l'utilisateur. |
| 2026-07-02 | 2.2, 2.3 | Créé `hooks/useFileTree.ts` (Composite générique `useFileTree<T extends FileTreeInputFile>`, exporte aussi `getSortedNodes`/`TreeNode`) depuis `CommitFileList.tsx` (682 → 467 lignes). En relisant `WipStagingPanel.tsx` pour l'action 2.3, constaté qu'il n'y avait pas de duplication réelle (son `wipBatches` est un regroupement plat, pas un arbre récursif) — 2.3 marquée ⏭️ et le plan (`13-...md`) corrigé en conséquence plutôt que de forcer une migration artificielle. Vérifié : `pnpm typecheck` passe. |
| 2026-07-02 | 2.4 | Créé `stores/repoUI.store.ts` (openTabs, activeRepo, activeTab, activeDiffFile, activeLeftPanel, editingOid + `DASHBOARD_TAB`/`REWARDS_TAB`/`PULL_REQUESTS_TAB`) et `stores/repoData.store.ts` (savedRepos, discoveredRepos, repoCache, wipMessages, hiddenStashes), supprimé `repos.store.ts`, mis à jour les 22 fichiers consommateurs un par un (App.tsx, DashboardPage, RepoRow, ReadmePanel, RepoView, RepoSelector, Footer, StateTags, ActionToolbar, NewTabMenu, CloneRepoDialog, BranchContext, NotificationDropdown, TabBar, DiffViewCenter, RepositorySidebar, GraphRow, GitGraph, CommitDetailsPanel, CommitHeaderInfo, useKeyboardShortcuts, useNotificationWatcher). `removeRepo` (repoData) appelle `useRepoUIStore.getState().clearTabStateForRemovedRepo()` en cross-store pour préserver le comportement exact de nettoyage des onglets/sélection. Persistance : `repoData.store` garde la clé localStorage `git-manager-repos` (pas de perte des repos sauvegardés/pins/wip drafts existants) ; `repoUI.store` utilise une nouvelle clé `git-manager-repos-ui` (les onglets ouverts seront réinitialisés une fois après mise à jour — effet de bord mineur assumé, documenté ici). Vérifié : `grep` ne trouve plus aucune référence à `repos.store`/`useReposStore` dans tout le repo, `pnpm typecheck` passe. Pas de test manuel dans l'app (Tauri, non testable en navigateur) — **fortement recommandé de lancer `pnpm dev` et vérifier onglets/sélection de repo/diff/stash avant de merger**, vu l'ampleur du changement. |
| 2026-07-02 | 3.1, 3.3, 3.4 | Créé `services/git_diff.rs` (diff_foreach_files/finalize/build_diff, remplace les corps dupliqués dans `commit.rs` et `log.rs` ; au passage, `commit.rs` gagne le statut `"typechange"` que seul `log.rs` gérait — comportement unifié). Créé `services/git_repo.rs` (`build_git_repo`, `open_repo` ne le réimplémente plus inline). Créé `services/git_commit.rs` (stage_file/unstage_file/discard_file_changes/stage_all/unstage_all/create_commit + `DiscardResult`/`CommitResult`), `commands/commit.rs` réduit à des wrappers `#[tauri::command]` minces. Tailles : `commit.rs` 605→264, `log.rs` 783→683, `repo.rs` 611→526. Vérifié : `cargo build` + `cargo clippy` passent sans nouvelle erreur/warning. **3.2 (GitGraphBuilder) reportée** — voir note dans "Étape courante" : c'est l'algorithme de layout du graphe, trop risqué à toucher sans pouvoir tester visuellement le rendu. |
| 2026-07-02 | 4.1, 4.2, 4.3 | Renommé `lib/gameObserver.ts` → `lib/appEventBus.ts` (3 consommateurs mis à jour : `App.tsx`, `PullRequestsPage.tsx`, `game.store.ts`), créé `api/service.ts` (`callCommand`). En lisant `api/git.api.ts` avant de le migrer, constaté que la plupart de ses fonctions pilotent aussi l'historique undo/redo avec une logique différente par action (pas un simple "invoke + notify" uniforme) — forcer toute la fonction à travers `callCommand` aurait été une mauvaise abstraction. Resserré le scope : seuls les 8 sites qui notifiaient déjà `gameObserver` (stage/unstage/stageAll/unstageAll/commit/discard/fixup/autosquash) migrés vers `callCommand`, en ne wrappant que l'appel `invoke` lui-même. 4.4 marquée ⏭️ pour la même raison que 2.3 : forcer les autres `api/*.api.ts` (qui ne notifient rien) à travers `callCommand` aurait été de l'indirection sans bénéfice — plan (`13-...md`) corrigé en conséquence. Vérifié : `pnpm typecheck` passe, `cargo build` intact (aucun fichier Rust touché). |
