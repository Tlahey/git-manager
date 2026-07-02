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
| 3.2 | Extraire l'algorithme de layout (colonnes/couleurs/edges) hors de `get_log` dans `services/git_graph.rs::build_graph_nodes()` — fonction pure, pas de `GitGraphBuilder` chaînable (re-scopé, un seul point d'appel, pas de valeur ergonomique à un Builder ici) | `services/git_graph.rs`, `commands/log.rs` | 3.1 | ✅ |
| 3.5 | Vérifier que `commands/log.rs` et `commands/commit.rs` sont redescendus à ~150 lignes chacun (désérialisation + délégation + erreurs uniquement) | `commands/log.rs`, `commands/commit.rs` | 3.1–3.3 | ✅ (log.rs 282, commit.rs 264 — au-dessus de 150 mais l'essentiel de ce qui reste sont des commandes légitimes distinctes, pas de la logique dupliquée) |

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
| 5.1 | ~~Définir l'interface `DiffRenderStrategy`~~ — **re-scopé, pas applicable** : en relisant `DiffViewCenter.tsx`, son seul branchement par type de contenu est un ternaire à 2 branches (`isBinary ? placeholder : MonacoDiffViewer`), pas un `if/else` empilé. Aucun cas "image" nulle part dans le code. "Split-view" est un prop (`viewMode`) de `MonacoDiffViewer`, pas une stratégie séparée. Une interface Strategy pour un ternaire de 5 lignes serait de la sur-ingénierie. | nouveau module côté `components/git-graph/` | Phase 2–4 stabilisées | ⏭️ |
| 5.2 | ~~Refactorer `DiffViewCenter.tsx` pour déléguer à la stratégie~~ — même raison, rien à déléguer. La vraie taille du fichier (427 lignes) vient du header/toolbar (tabs, blame/history, navigation, stage/discard), pas du rendu de diff — un futur découpage en sous-composant serait une action R1 différente, hors scope de ce plan tel qu'écrit. | `components/git-graph/DiffViewCenter.tsx` | 5.1 | ⏭️ |

## Phase 6 — Actions ponctuelles post-plan (audit de suivi)

Le plan initial (phases 1-5) est entièrement traité. Conformément à la note de clôture
ci-dessous, les actions suivantes sont ajoutées ici au fil de l'eau, à mesure qu'un audit
ponctuel identifie un nouveau fichier trop gros ou une nouvelle duplication — sans rouvrir
les phases closes.

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 6.1 | Extraire la dérivation de données (nœud WIP, filtrage recherche, waterlines, index origin/main) de `GitGraph.tsx` dans un hook `useGitGraphNodes` | `hooks/useGitGraphNodes.ts`, `components/git-graph/GitGraph.tsx` | — | ✅ |
| 6.2 | Extraire les actions impératives (menu contextuel natif commit/stash, copie SHA, fixup, commit WIP, toast) de `GitGraph.tsx` dans un hook `useGitGraphActions` | `hooks/useGitGraphActions.ts`, `components/git-graph/GitGraph.tsx` | — | ✅ |
| 6.3 | Extraire la logique du panneau de commit WIP (mode classique + mode "batch commit" avec génération IA par groupe et restauration du staging) de `WipStagingPanel.tsx` dans un hook `useWipCommitPanel` | `hooks/useWipCommitPanel.ts`, `components/git-graph/components/WipStagingPanel.tsx` | — | ✅ |
| 6.4 | Extraire l'édition de message de commit/stash (amend, ouverture via `editingOid`, reset au changement de commit, copie SHA) de `CommitHeaderInfo.tsx` dans un hook `useCommitMessageEdit` | `hooks/useCommitMessageEdit.ts`, `components/git-graph/components/CommitHeaderInfo.tsx` | — | ✅ |

### 6.5 — Violation R2 systémique : 27 fichiers contournent `api/*.api.ts`

Découvert en auditant `useSidebarRows.ts` : 27 fichiers (`hooks/`, `components/`, `stores/`)
importent des fonctions depuis `lib/tauri.ts` directement au lieu de passer par `api/*.api.ts`,
en violation de la règle documentée dans `CLAUDE.md` ("Components and hooks should import from
here, not from `lib/tauri.ts` directly"). Gravité variable :

- **Bug réel (pas juste cosmétique)** : plusieurs de ces sites appellent la fonction brute alors
  qu'un wrapper `api*` existant fait plus que juste relayer l'appel — `apiStageFile`/`apiUnstageFile`/
  `apiCreateFixupCommit`/`apiRunAutosquash` notifient `appEventBus` (achievements) via `callCommand`,
  et plusieurs wrappers `api*` alimentent aussi le undo/redo (`clearRedo`, `pushAction`). Les
  contourner fait silencieusement disparaître ces effets de bord pour les sites concernés.
- **Dette pure R2** : d'autres sites (hooks de lecture type `useGitStatus`/`useGitLog`) n'ont
  simplement pas de wrapper `api*` correspondant à créer.
- Décidé avec l'utilisateur (2026-07-02) : migration complète, en plusieurs PR groupées par lot
  plutôt qu'une seule PR géante — même cadence que le reste de la Phase 6.

| # | Action | Fichier(s) | Dépend de | Statut |
|---|---|---|---|---|
| 6.5.a | **Lot 1 (bugs réels)** : supprimer `components/working-tree/` (mort, non référencé nulle part — `WorkingTreePanel.tsx`/`CommitMessageBox.tsx`/`FileStatusItem.tsx`) ; remplacer les appels bruts par les wrappers `api*` déjà existants dans `DiffViewCenter.tsx` (stage/unstageFile), `FixupTargetSelector.tsx` (createFixupCommit), `AutosquashPreviewDialog.tsx` (autosquashPreview/runAutosquash), `RevertDialog.tsx` (revertCommit), `PendingFixupsBanner.tsx` (getPendingFixups), `ResetDialog.tsx` (getCommitsBetween), `BranchContext.tsx` + `RepoView.tsx` (openRepo → `apiOpenRepo` de `repo.api.ts`), `useTheme.ts` (getUserThemes → `apiGetUserThemes` de `theme.api.ts`) | 9 fichiers modifiés + 3 supprimés | — | ✅ |
| 6.5.b | **Lot 2** : créer les wrappers de lecture manquants dans `git.api.ts` (`apiGetRepoStatus`, `apiGetLog`, `apiGetBranches`, `apiGetFileDiff`, `apiGetCommitDiff`, `apiGetFileRawContents`, `apiGetTags`, `apiListSubmodules`, `apiGetRebaseState`) et migrer `useGitStatus.ts`, `useGitLog.ts`, `useBranches.ts`, `useFileDiff.ts`, `useCommitDiff.ts`, `useFileRawContents.ts`, `useSidebarRows.ts`, `components/repository-sidebar/{SidebarRail,TagsSection,SubmodulesSection}.tsx`, `components/action-toolbar/StateTags.tsx` | `api/git.api.ts` + 11 fichiers | 6.5.a | ✅ |
| 6.5.c | **Lot 3** : `repo.api.ts` (`apiCloneRepo`, `apiInitRepo`), `git.api.ts` (`apiCreateBranch`, `apiFetchRemote`, `apiPullBranch`, `apiPushBranch`), nouveau `api/undoSupport.api.ts` (`apiUnpinObject`/`apiObjectsExist`, fichier dédié pour éviter un cycle d'import — voir note), `ollama.api.ts` (`apiCancelGeneration`, `apiGenerateCommitMessage`) et migrer `CloneRepoDialog.tsx`, `NewTabMenu.tsx`, `CreateBranchHereDialog.tsx`, `ActionToolbar.tsx`, `stores/undoHistory.store.ts`, `hooks/useOllamaGeneration.ts` | `api/repo.api.ts`, `api/git.api.ts`, `api/undoSupport.api.ts`, `api/ollama.api.ts` + 6 fichiers | 6.5.a, 6.5.b | ✅ |

Note (import circulaire) : `unpinObject`/`objectsExist` sont utilisés seulement par
`stores/undoHistory.store.ts`. Comme `git.api.ts` importe déjà `useUndoHistoryStore` depuis ce
même store (pour `pushAction`/`clearRedo`), les faire passer par `git.api.ts` aurait créé un
cycle `git.api.ts` → `undoHistory.store.ts` → `git.api.ts`. Créé `api/undoSupport.api.ts` à part
(ne dépend que de `lib/tauri.ts`, dépendu uniquement par le store) pour rester sans cycle tout en
respectant R2.

Note (bonus) : `CreateBranchHereDialog.tsx` appelait `checkoutBranch` brut (pas `apiCheckoutBranch`)
sans aucun paramètre `opts` — en migrant vers `apiCheckoutBranch(repoPath, trimmed)`, le checkout
après création de branche alimente maintenant `clearRedo()` comme les autres chemins de checkout
de l'app (`apiCheckoutBranch` appelle `clearRedo(path)` quand `opts` est `undefined`) ; avant, ce
checkout ne touchait pas du tout le undo/redo. Même catégorie de bug que le lot 1.

**Migration R2 (6.5) terminée.** `useGitHubRepos.ts`/`useGithubDeviceFlow.ts` n'importent que des
**types** depuis `lib/tauri.ts` (`import type { ... }`) — ce n'est pas une violation R2 (pas
d'appel de fonction), laissés tels quels. Plus aucun fichier `hooks/`/`components/`/`stores/`
n'appelle une fonction de `lib/tauri.ts` directement.

---

## Étape courante

**Toutes les phases sont terminées.** Phase 1 ✅. Phase 2 : 2.1/2.2/2.4 ✅, 2.3 ⏭️ (non
applicable), 2.5 ⏭️ (optionnelle, non faite). Phase 3 : 3.1/3.2/3.3/3.4/3.5 ✅ (3.2 extrait sans
`GitGraphBuilder`, vérifié ligne à ligne contre l'original). Phase 4 : 4.1/4.2/4.3 ✅, 4.4 ⏭️ (non
applicable). Phase 5 : 5.1/5.2 ⏭️ (non applicable, pas de Strategy à extraire). Phase 6
(actions ponctuelles post-plan) : 6.1/6.2/6.3/6.4 ✅, 6.5.a/6.5.b/6.5.c ✅ (migration R2
terminée, 0 fichier restant appelant `lib/tauri.ts` directement hors imports de type).

**Prochaine étape** : plus d'action de refactor planifiée. Si de nouveaux fichiers grossissent,
qu'une nouvelle duplication apparaît, ou qu'un nouveau site réintroduit un appel direct à
`lib/tauri.ts`, ajouter une nouvelle action dans la Phase 6 plutôt que de rouvrir les phases
closes.

**Point d'attention transverse (non testable depuis cet environnement, Tauri-only)** : les
changements touchant au rendu du graphe de commits (3.2, 6.1, 6.2) ont été vérifiés par lecture
attentive / diff ligne à ligne, mais jamais visuellement. **Un passage manuel via `pnpm dev`**
(plusieurs branches/merges/stashes, sélection de commit, menu contextuel, commit WIP) reste
recommandé avant de merger toute PR qui les inclut.

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
| 2026-07-02 | 5.1, 5.2 | Relu `DiffViewCenter.tsx` avant d'y extraire un `DiffRenderStrategy` — l'hypothèse de l'audit ne tenait pas : un seul ternaire binaire/texte, pas d'`if/else` empilés, pas de cas "image", "split-view" est un prop de `MonacoDiffViewer` et non une stratégie séparée. Pas de Strategy à extraire pour un ternaire de 5 lignes (sur-ingénierie). 5.1/5.2 marquées ⏭️, plan (`13-...md`) corrigé. |
| 2026-07-02 | 3.2 | Extrait l'algorithme de layout de `get_log` (colonnes/couleurs/edges, ~375 lignes) dans `services/git_graph.rs::build_graph_nodes(repo, oids, stash_oids, refs_map, branch)`. Re-scopé sans `GitGraphBuilder` chaînable : un seul point d'appel, params déjà des `Option<T>` simples, un Builder n'aurait rien apporté (plan corrigé). Vérification supplémentaire vu le risque (algorithme non testable visuellement ici) : diff ligne à ligne entre le corps original et le corps extrait — **identique**, à l'exception des 4 adaptations attendues liées au passage de paramètres possédés (`Vec<Oid>`, `Option<String>`) à empruntés (`&[Oid]`, `Option<&str>`) et une simplification de style (`.map_err(AppError::Git)` au lieu d'une closure équivalente). `commands/log.rs` : 683→282 lignes. Vérifié : `cargo build` + `cargo clippy` passent sans nouvelle erreur/warning. **Le plan est désormais entièrement traité.** Recommandation : tester le rendu du graphe manuellement (`pnpm dev`, plusieurs branches/merges/stashes) avant de merger, malgré la vérification ligne à ligne. |
| 2026-07-02 | 6.1, 6.2 | Audit de suivi post-plan (`main` à jour, toutes les PR 1-4 mergées) : `GitGraph.tsx` était remonté à 587 lignes en mélangeant dérivation de données, actions impératives, virtualisation et rendu — violation R1 (composant = rendu uniquement). Créé `hooks/useGitGraphNodes.ts` (wipNode/filteredNodes/waterlines/originMainIndex, mémoïsés) et `hooks/useGitGraphActions.ts` (menu contextuel natif commit/stash, copie SHA, fixup, commit WIP, toast). `GitGraph.tsx` réduit à 587→377 lignes, ne garde que l'orchestration/rendu. Au passage, corrigé un vrai bug de perf : `originMainIndex` était recalculé par un `findIndex` sur tout `filteredNodes` à *chaque ligne visible à chaque render* (O(n²) dans la boucle de virtualisation) — déplacé dans le `useMemo` du nouveau hook, calculé une seule fois par changement de `filteredNodes`. Supprimé aussi un `console.log('[isSelectedCommitHead]', ...)` de debug oublié dans le code. Vérifié : `pnpm typecheck` passe (`pnpm lint` échoue pour la même raison préexistante que 1.7, sans rapport). Pas de test manuel dans l'app (Tauri, non testable en navigateur) — recommandé de vérifier menu contextuel, commit WIP et affichage des connexions près de `origin/main` via `pnpm dev` avant de merger. **Mergé via PR #5.** |
| 2026-07-02 | 6.3 | Suite de l'audit de suivi : `WipStagingPanel.tsx` (488 lignes) mélangeait tout le moteur du "batch commit" (regroupement par dossier, génération IA de message par groupe avec staging/unstaging temporaire et restauration de l'état d'index original, commit du groupe) et le mode classique (message unique, historique, stage/unstage all) avec le rendu — violation R1 similaire à 6.1/6.2. Créé `hooks/useWipCommitPanel.ts`, qui encapsule tout ça (instancie lui-même `useOllamaGeneration`/`useCommitMessageHistory`). `WipStagingPanel.tsx` réduit à 488→320 lignes, ne garde que l'état des dropdowns UI dérivés (`statusIcons`/`statusLetters`) et le rendu. Point d'attention lors de l'extraction : `t()` (i18n) et l'`alert()` de message vide dans `commitBatch` doivent être passés/conservés explicitement car le hook n'a pas de contexte de traduction propre — vérifié que les deux comportements (placeholder traduit pendant la génération IA, alerte si message de batch vide) sont identiques à l'original avant de committer. `gitStatus` typé `GitStatus \| undefined` au lieu de `any` (le type réel déjà produit par `useGitStatus`, aucune perte de compatibilité). Vérifié : `pnpm typecheck` passe. Pas de test manuel dans l'app — recommandé de tester le mode batch (génération IA + commit de groupe) et le mode classique via `pnpm dev` avant de merger. |
| 2026-07-02 | 6.4 | Suite de l'audit de suivi : `CommitHeaderInfo.tsx` (429 lignes) mélangeait l'édition de message (ouverture via `editingOid` global, reset des champs au changement de commit sélectionné, sauvegarde en amend-commit ou renommage de stash selon le cas, copie de SHA) avec le rendu — violation R1 similaire à 6.1-6.3. Créé `hooks/useCommitMessageEdit.ts`. `CommitHeaderInfo.tsx` réduit à 429→377 lignes. Note : le fichier contient aussi trois blocs JSX quasi identiques (affichage du message pour commit HEAD / stash / commit historique en lecture seule) qui auraient pu être fusionnés en un sous-composant partagé, mais chacun a des différences réelles (data-testid distincts pour les tests, source du texte différente pour les stashes, libellé du title) — les fusionner aurait ajouté 5-6 props pour économiser ~50 lignes, jugé non rentable (sur-ingénierie), laissé tel quel. Vérifié : `pnpm typecheck` passe. Pas de test manuel dans l'app — recommandé de tester l'édition de message (commit HEAD, commit historique, stash) via `pnpm dev` avant de merger. |
| 2026-07-02 | 6.5.a | En auditant `useSidebarRows.ts`, découverte d'une violation R2 systémique : 27 fichiers appellent `lib/tauri.ts` directement au lieu de passer par `api/*.api.ts`. Gravité plus élevée que prévu — certains sites contournent des wrappers `api*` **déjà existants** qui font plus qu'un simple relai : `apiStageFile`/`apiUnstageFile`/`apiCreateFixupCommit`/`apiRunAutosquash` notifient `appEventBus` (achievements, via `callCommand`), et plusieurs alimentent le undo/redo (`pushAction`/`clearRedo`) — les contourner fait disparaître silencieusement ces effets de bord. Décision utilisateur : migration complète en plusieurs PR groupées (pas une PR géante). Lot 1 (celui-ci) : découverte que `components/working-tree/` (`WorkingTreePanel.tsx`, `CommitMessageBox.tsx`, `FileStatusItem.tsx`) est du code mort — non référencé nulle part dans l'app, supprimé entièrement plutôt que corrigé. Corrigé les 8 autres sites qui contournaient un wrapper `api*` déjà existant : `DiffViewCenter.tsx`, `FixupTargetSelector.tsx`, `AutosquashPreviewDialog.tsx`, `RevertDialog.tsx`, `PendingFixupsBanner.tsx`, `ResetDialog.tsx`, `BranchContext.tsx` + `RepoView.tsx` (→ `apiOpenRepo` de `repo.api.ts`), `useTheme.ts` (→ `apiGetUserThemes` de `theme.api.ts`) — dans tous les cas simple remplacement d'import, aucun nouveau wrapper à créer. Vérifié : `pnpm typecheck` passe. Reste 18 fichiers pour les lots 2 (6.5.b, wrappers de lecture manquants) et 3 (6.5.c, repo/branche/remote/Ollama/undo-support) — voir section 6.5 pour le détail. |
| 2026-07-02 | 6.5.b | Lot 2 de la migration R2 : ajouté une section "Reads" dans `git.api.ts` avec 8 wrappers de lecture (`apiGetRepoStatus`, `apiGetLog`, `apiGetBranches`, `apiGetCommitDiff`, `apiGetFileDiff`, `apiGetFileRawContents`, `apiGetTags`, `apiListSubmodules`, `apiGetRebaseState`) — tous de simples relais (pas de undo/redo/observer nécessaire, ce sont des lectures pures). Migré les 11 fichiers concernés : `useGitStatus.ts`, `useGitLog.ts`, `useBranches.ts`, `useFileDiff.ts`, `useCommitDiff.ts`, `useFileRawContents.ts`, `useSidebarRows.ts`, `components/repository-sidebar/{SidebarRail,TagsSection,SubmodulesSection}.tsx`, `components/action-toolbar/StateTags.tsx`. Vérifié : `pnpm typecheck` passe. Reste 6 fichiers réels pour le lot 3 (6.5.c) — `useGitHubRepos.ts`/`useGithubDeviceFlow.ts` n'important que des types, ils ne comptent pas. |
| 2026-07-02 | 6.5.c | Lot 3 (dernier) de la migration R2. Ajouté `apiCloneRepo`/`apiInitRepo` dans `repo.api.ts` ; `apiCreateBranch`/`apiFetchRemote`/`apiPullBranch`/`apiPushBranch` dans `git.api.ts` ; `apiGenerateCommitMessage`/`apiCancelGeneration` dans `ollama.api.ts`. Découvert en cours de route : router `unpinObject`/`objectsExist` (utilisés uniquement par `stores/undoHistory.store.ts`) à travers `git.api.ts` aurait créé un cycle d'import (`git.api.ts` importe déjà `useUndoHistoryStore` pour `pushAction`/`clearRedo`) — créé `api/undoSupport.api.ts` à part pour ces deux-là, sans dépendance vers le store. Migré les 6 fichiers : `CloneRepoDialog.tsx`, `NewTabMenu.tsx`, `CreateBranchHereDialog.tsx`, `ActionToolbar.tsx`, `stores/undoHistory.store.ts`, `hooks/useOllamaGeneration.ts`. Bonus découvert en migrant `CreateBranchHereDialog.tsx` : il appelait `checkoutBranch` brut sans passer par `apiCheckoutBranch`, donc le checkout après création de branche ne touchait jamais le undo/redo (`clearRedo` jamais appelé) — même catégorie de bug silencieux que le lot 1, corrigé au passage par le simple remplacement d'import. Vérifié : `pnpm typecheck` passe, et `grep` confirme 0 fichier `hooks/`/`components/`/`stores/` import de fonction (pas type) depuis `lib/tauri.ts` restant. **Migration R2 (action 6.5, 3 PR) terminée.** |
