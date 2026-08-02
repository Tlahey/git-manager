# Audit git-manager — Phase 1 : Cartographie

> Lecture seule. Aucun fichier de code n'a été modifié pour produire ce document.
> Date : 2026-08-02 · Commits analysés : 741 (historique complet) · Branche : `claude/code-audit-refactor-plan-873457`

## 1. Stack & conventions en place

- **Monorepo** pnpm (catalog) + Turborepo, 1 app (`apps/desktop`) + 10 packages partagés ([package.json](package.json), [pnpm-workspace.yaml](pnpm-workspace.yaml), [turbo.json](turbo.json)).
- **Frontend** : React/Vite + TypeScript strict, Tailwind. **Backend** : Rust (Tauri v2) via `git2`.
- **Conventions déjà en vigueur et globalement respectées** (vérifié, pas juste déclaré dans CLAUDE.md) :
  - Aucun appel `invoke()` direct depuis un composant — seuls 3 fichiers hors `lib/tauri.ts` appellent `invoke()` : [shell.api.ts:17](apps/desktop/src/api/shell.api.ts:17) (légitime, c'est un fichier `api/*`), et deux fichiers `lib/` à usage unique — [aiTranscriptLog.ts:80](apps/desktop/src/lib/aiTranscriptLog.ts:80), [activityLogPersistence.ts:52](apps/desktop/src/lib/activityLogPersistence.ts:52) (écriture de logs fire-and-forget, risque faible, voir §5).
  - Les 8 imports de `lib/tauri.ts` trouvés en dehors de la couche API sont tous des `import type` (autorisés explicitement par CLAUDE.md) — aucune violation du contournement de couche décrit dans l'historique du repo.
  - `any` / `as any` : **2 occurrences réelles** dans tout `apps/desktop/src` + `packages` ([packages/editor/.storybook/preview.ts:2-3](packages/editor/.storybook/preview.ts:2), config Storybook, sans impact prod). Le reste des faux positifs vient de commentaires JSDoc ("as any other section", etc.).
  - TODO/FIXME/HACK : **0 occurrence réelle** dans le code (les seuls résultats bruts venaient de chaînes de prompts IA dans `packages/ai`, pas de dette marquée).
  - Couverture de tests co-localisés : **683 fichiers de test pour 773 fichiers source** (~88%), et tous les fichiers "hotspot" identifiés en §4 ont un test (`GitGraph.test.tsx`, `GraphRow.test.tsx`, `RepositorySidebar.test.tsx`, `SidebarRowView.test.tsx`, etc.).
  - **Pas de CI** exécutant lint/typecheck/tests : `.github/workflows/` ne contient que `deploy-landing.yml`, `prepare-release.yml`, `release.yml` — aucun workflow de vérification sur PR/push.

Ce sont des points forts réels, pas de la complaisance : la base est propre sur le typage, le mort-code et la discipline de test. La dette n'est **pas diffuse**, elle est concentrée dans un petit nombre de fichiers — ce qui est plutôt une bonne nouvelle pour un plan d'action ciblé.

## 2. Points d'entrée

| Côté | Fichier | Rôle |
|---|---|---|
| Frontend | [apps/desktop/src/main.tsx](apps/desktop/src/main.tsx), [App.tsx](apps/desktop/src/App.tsx) | bootstrap React |
| Backend | [apps/desktop/src-tauri/src/main.rs](apps/desktop/src-tauri/src/main.rs), [lib.rs](apps/desktop/src-tauri/src/lib.rs) | bootstrap Tauri, `tauri::generate_handler![...]` (registre central des commandes IPC) |

## 3. Architecture en couches (confirmée par lecture du code, pas seulement par CLAUDE.md)

```
Composant/Hook/Store (apps/desktop/src/{components,app,hooks,stores})
   │  (jamais d'invoke() direct — vérifié §1)
   ▼
api/*.api.ts   (apps/desktop/src/api — 1 fichier par domaine)
   ▼
lib/tauri.ts   (1 wrapper typé par commande — 189 exports / 1087 lignes)
   ▼  invoke('command_name', …)
commands/*.rs  (apps/desktop/src-tauri/src/commands — 31 fichiers, thin : désérialise/délègue/mappe erreurs)
   ▼
services/*.rs  (apps/desktop/src-tauri/src/services — 45 fichiers, logique git2 réelle)
```

Le découpage Rust est **beaucoup plus fin** côté `services/` (un fichier par sous-domaine : `git_stash.rs`, `git_branch.rs`, `git_remote.rs`, `git_rollback.rs`…) que côté `api/*.ts`, où tout le domaine "git" est regroupé dans un seul fichier ([git.api.ts](apps/desktop/src/api/git.api.ts), 1253 lignes) — cf. §4.

## 4. Plus gros modules

### Frontend (TS/TSX, hors tests)

| Fichier | Lignes | Modifications (historique) | Remarque |
|---|---:|---:|---|
| [apps/desktop/src/api/github.api.ts](apps/desktop/src/api/github.api.ts) | 1473 | 20 | domaine unique (GitHub), cohérent |
| [apps/desktop/src/components/git-graph/GitGraph.tsx](apps/desktop/src/components/git-graph/GitGraph.tsx) | 1299 | **72** | ⚠️ voir §5, plus gros signal du repo |
| [apps/desktop/src/lib/graphContextMenus.ts](apps/desktop/src/lib/graphContextMenus.ts) | 1258 | — | à examiner en Phase 2 |
| [apps/desktop/src/api/git.api.ts](apps/desktop/src/api/git.api.ts) | 1253 | 40 | ~90 exports, **7 sous-domaines mélangés** (commit/stage, fixup/autosquash, patch, stash, branch/checkout, remote/tags, log/diff/blame, bisect, rebase) — voir §5 |
| [apps/desktop/src/lib/tauri.ts](apps/desktop/src/lib/tauri.ts) | 1087 | 70 | 189 exports, ~5,7 lignes/export — grand par nature (1 wrapper par commande), pas un god-file au sens complexité |
| [packages/git-types/src/index.ts](packages/git-types/src/index.ts) | 857 | 42 | DTOs miroir des `serde` Rust, croissance mécanique attendue |
| [packages/editor/src/ConflictResolver.tsx](packages/editor/src/ConflictResolver.tsx) | 786 | — | à examiner en Phase 2 |
| [apps/desktop/src/hooks/useSidebarRows.ts](apps/desktop/src/hooks/useSidebarRows.ts) | 775 | 21 | à examiner en Phase 2 |
| [apps/desktop/src/components/git-graph/components/CommitFileList.tsx](apps/desktop/src/components/git-graph/components/CommitFileList.tsx) | 761 | — | à examiner en Phase 2 |
| [apps/desktop/src/hooks/useGitGraphActions.ts](apps/desktop/src/hooks/useGitGraphActions.ts) | 719 | 22 | déjà extrait de GitGraph.tsx (bon signe) |
| [apps/desktop/src/hooks/useGitGraphNodes.ts](apps/desktop/src/hooks/useGitGraphNodes.ts) | 712 | — | déjà extrait de GitGraph.tsx (bon signe) |
| [apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx) | 624 | 31 | ⚠️ 21 hooks internes — voir §5 |
| [apps/desktop/src/stores/repoUI.store.ts](apps/desktop/src/stores/repoUI.store.ts) | 612 | 28 | à examiner en Phase 2 |
| [apps/desktop/src/components/git-graph/GraphRow.tsx](apps/desktop/src/components/git-graph/GraphRow.tsx) | 557 | **39** | fort ratio churn/taille |
| [apps/desktop/src/components/repository-sidebar/SidebarRowView.tsx](apps/desktop/src/components/repository-sidebar/SidebarRowView.tsx) | 472 | 33 | 0 hook — grand par variété de JSX (rendu conditionnel par type de ligne), pas par logique |

### Backend (Rust)

| Fichier | Lignes | Modifications | Remarque |
|---|---:|---:|---|
| [services/git_remote.rs](apps/desktop/src-tauri/src/services/git_remote.rs) | 1830 | **12 seulement** | gros mais stable — mélange fetch/pull/push/tags/CRUD remote (~30 fn), candidat à découpage mais **faible urgence** (voir §6) |
| [services/git_graph.rs](apps/desktop/src-tauri/src/services/git_graph.rs) | 1113 | — | logique de layout du graphe, doc déjà présente (invariants en commentaire de module, conforme convention CLAUDE.md) |
| [services/package_health.rs](apps/desktop/src-tauri/src/services/package_health.rs) | 919 | **1** | feature toute récente (dépendances/health), explique son absence du CLAUDE.md — pas un problème, juste pas encore documentée |
| [services/git_merge_diff.rs](apps/desktop/src-tauri/src/services/git_merge_diff.rs) | 656 | — | a des tests `#[cfg(test)]` selon CLAUDE.md |
| [commands/window.rs](apps/desktop/src-tauri/src/commands/window.rs) | 630 | 5 | doc de module exemplaire (rationale mesurée, pas suppositions) — modèle à suivre, pas un problème |
| [services/git_branch.rs](apps/desktop/src-tauri/src/services/git_branch.rs) | 624 | — | |
| [services/ai_activity.rs](apps/desktop/src-tauri/src/services/ai_activity.rs) | 615 | — | |
| [services/git_diff.rs](apps/desktop/src-tauri/src/services/git_diff.rs) | 612 | — | |
| [lib.rs](apps/desktop/src-tauri/src/lib.rs) | 384 | **62** | churn élevé mais mécanique : chaque nouvelle commande y ajoute une ligne d'import + une ligne dans `generate_handler!` — pas un god-file, un registre |

## 5. Zones à risque (croisement fréquence × taille × complexité)

Priorisation par **fréquence de modification**, pas par volume — conformément à la consigne. Les fichiers gros-mais-stables (`git_remote.rs`, `window.rs`) sont **rétrogradés** malgré leur taille.

1. **[GitGraph.tsx](apps/desktop/src/components/git-graph/GitGraph.tsx)** — 1299 lignes, **72 modifications**, 1 seul export (un unique composant). Orchestre en interne :
   - 13 hooks custom importés (`useGitLog`, `useGitStatus`, `useWorktreeWipStatuses`, `useGitGraphNodes`, `useGitGraphActions`, `useTagContextMenu`, `useBisectState`, `useCommitSelection`, `useGraphColumnScroll`, etc.)
   - **+ ~20 `useEffect`/`useMemo`/`useState`/`useRef` supplémentaires inline** ([lignes 145–808](apps/desktop/src/components/git-graph/GitGraph.tsx#L145)) couvrant au moins 7 responsabilités distinctes : layout des colonnes du graphe, recherche/surlignage, sélection de commit, drag & drop de refs, auto-ouverture de conflits de merge, état de progression du rebase, indexation des stashes.
   - Signal clair de **god component** : une extraction partielle a déjà eu lieu ([useGitGraphActions.ts](apps/desktop/src/hooks/useGitGraphActions.ts), [useGitGraphNodes.ts](apps/desktop/src/hooks/useGitGraphNodes.ts)) mais le fichier continue d'accumuler de nouveaux effets/mémos inline plutôt que d'étendre ce pattern.
   - Le plus haut ratio churn×taille×complexité du repo → **candidat P0**.

2. **[git.api.ts](apps/desktop/src/api/git.api.ts)** — 1253 lignes, 40 modifications, ~90 fonctions couvrant 7 sous-domaines mélangés (commit/stage, fixup/autosquash, patch/dependency-patch, stash, branch/checkout/merge/push, remote/tags, log/diff/blame/bisect/rebase). Le backend Rust a scindé ces mêmes sous-domaines en fichiers `services/git_*.rs` distincts ; la couche API frontend ne suit pas ce découpage. Risque : navigation coûteuse, PRs qui touchent un seul sous-domaine mais un fichier entier de 1253 lignes → conflits de merge inutiles vu le churn.

3. **[RepositorySidebar.tsx](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx)** — 624 lignes, 31 modifications, **21 hooks internes**, 2 exports. Même famille de problème que GitGraph.tsx, à échelle réduite.

4. **[GraphRow.tsx](apps/desktop/src/components/git-graph/GraphRow.tsx)** — 557 lignes, **39 modifications** — 2e plus fort ratio churn/taille du repo après GitGraph.tsx.

Tous ces fichiers ont déjà un test associé (`GitGraph.test.tsx`, `RepositorySidebar.test.tsx`, `GraphRow.test.tsx`) — c'est le prérequis de sécurité déjà rempli pour aborder un refactoring (cf. règle de la Phase 3).

## 6. À ne pas prioriser (gros mais stable, ou nouveau et pas encore un problème)

- **[git_remote.rs](apps/desktop/src-tauri/src/services/git_remote.rs)** (1830 lignes) : seulement 12 commits sur tout l'historique. Gros parce que le domaine (fetch/pull/push/tags/remote CRUD + gestion de conflits pull, pre-push hook) est réellement dense, mais il ne bouge presque jamais → risque de régression élevé si on le découpe pour un gain de lisibilité incertain. À ne toucher que si Phase 2 trouve un bug concret dedans.
- **[commands/window.rs](apps/desktop/src-tauri/src/commands/window.rs)** : doc de module exemplaire, faible churn (5). Rien à faire.
- **Cluster `package_health.rs`/`package_changelog.rs`/`package_usage.rs`/`dependency_patch.rs`** (~2260 lignes cumulées) : feature très récente (1 commit sur `package_health.rs`), absente du CLAUDE.md par simple décalage de documentation, pas par négligence. À revisiter seulement si son churn augmente.
- **[tauri.ts](apps/desktop/src/lib/tauri.ts)** (1087 lignes, 70 modifications) : churn élevé mais mécanique et attendu — un wrapper typé par commande, ~5,7 lignes chacun. Ce n'est pas un god-file, c'est une énumération. Pas de gain à le scinder tant que chaque commande reste un ajout isolé.
- **[lib.rs](apps/desktop/src-tauri/src/lib.rs)** (62 modifications) : registre central des commandes, churn mécanique par design (CLAUDE.md documente déjà ce compromis). Pas un point de douleur en soi.
- Locales i18n (`packages/i18n/locales/{en,fr}/*.json`, 94/41/30 modifications) : churn élevé mais attendu pour du contenu bilingue, pas un signal de dette de code.

## 7. Principe directeur retenu pour la suite (validé)

> "On a des tests donc logiquement on peut déplacer le contenu dans des fichiers plus petits et valider que la logique reste toujours la même. Le but est de scoper les fichiers (hooks avec hooks etc.) et avec des fichiers de configuration pour tout ce qui est clé de configuration pour les composants."

Traduction en méthode : ce ne sont **pas des réécritures**, ce sont des **déplacements mécaniques** (extraire tel bloc de hooks vers son propre fichier, telle table de correspondance vers un fichier de config) sans changer le comportement. Le test existant est le filet de sécurité — je vérifie, pour chaque zone, qu'un test le couvre déjà *avant* de proposer de la bouger, et je le signale explicitement quand ce n'est pas le cas.

Le pattern "fichier de config" **existe déjà** dans le repo et fonctionne bien : [columns.config.ts](apps/desktop/src/components/git-graph/columns.config.ts) sépare la définition déclarative des colonnes (`COLUMN_DEFS`, `COLUMN_ORDER`, largeurs par défaut/min) de la logique qui les consomme dans GitGraph.tsx. C'est la référence à reproduire ailleurs, pas un concept à inventer — avec un bémol : ce fichier est **100% commenté en français** ([columns.config.ts:1-108](apps/desktop/src/components/git-graph/columns.config.ts#L1)), à traduire en anglais dès qu'on le rouvre (convention CLAUDE.md).

## 8. Diagnostic ciblé (lecture complète des 4 zones à risque)

### 8.1 [GitGraph.tsx](apps/desktop/src/components/git-graph/GitGraph.tsx) — le god component (P0)

J'ai lu le fichier en entier (1299 lignes) et son test ([GitGraph.test.tsx](apps/desktop/src/components/git-graph/GitGraph.test.tsx), 1214 lignes, **81 `describe`/`it`**). Bonne nouvelle concrète : **la quasi-totalité des blocs à extraire a déjà son propre `describe` dédié** — la couverture existe presque exactement au découpage naturel du fichier, ce qui confirme le principe du §7.

| Extraction proposée (nouveau hook/fichier) | Bloc source actuel | Nature | Test déjà existant qui protège ce comportement |
|---|---|---|---|
| `useGraphLayout(...)` | [lignes 375–478](apps/desktop/src/components/git-graph/GitGraph.tsx#L375) — `graphMaxColumn`, `visibleColumns`, `refsWidth`/`graphWidth`, `graphColumnBounds`, `graphScrollX`, `graphOverflowZone`, `matchSet`/`authorMatchSet`, `dragHighlightSet` | **Pur** (que des `useMemo`, aucun effet de bord) — le plus sûr à extraire en premier | `describe('GitGraph — graph overflow zone', …)` [L333](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L333), `describe('GitGraph — search row dimming', …)` [L515](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L515), `describe('GitGraph — author filter row dimming', …)` [L536](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L536) |
| `useRebaseGraphView(repoPath)` | [lignes 224–262](apps/desktop/src/components/git-graph/GitGraph.tsx#L224) + [771–806](apps/desktop/src/components/git-graph/GitGraph.tsx#L771) (`conflictInfo`, `isRebasing`, `rebaseViewOpen`, `handleToggleConflictFiles`, `handleSelectRebaseStep`, `isRebaseStepLoaded`) | Effets + handlers, un seul domaine (vue de rebase) | `describe('GitGraph — rebase progress view', …)` [L822](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L822), `describe('GitGraph — rebase step routing', …)` [L914](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L914), `describe('GitGraph — conflicted files panel visibility', …)` [L985](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L985) |
| `useGraphScrollSync(...)` | [lignes 620–722](apps/desktop/src/components/git-graph/GitGraph.tsx#L620) — virtualizer + 3 effets de scroll (recherche, sélection externe, auto-select branche) | Effets, dépend de `useGraphLayout`/`filteredNodes` | `describe('GitGraph — commit search panel wiring', …)` [L560](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L560), `describe('GitGraph — pending graph selection bridge', …)` [L1110](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L1110), `describe('GitGraph — auto-select on branch/repo change', …)` [L763](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L763) |
| `useConflictMergeWindow(...)` | [lignes 170–197](apps/desktop/src/components/git-graph/GitGraph.tsx#L170) — ouverture de la fenêtre native de résolution de conflit | Effet isolé, aucune dépendance croisée | `describe('GitGraph — conflict merge window', …)` [L1147](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L1147) |
| `useSearchNavigation(searchQuery, totalMatches)` | [lignes 480–494](apps/desktop/src/components/git-graph/GitGraph.tsx#L480) | Petit, déjà quasi-isolé | même bloc `describe('GitGraph — commit search panel wiring', …)` [L560](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L560) |
| *(pas un nouveau hook)* replier le pont `pendingGraphAction`/`pendingCommitMenuOid` ([lignes 588–618](apps/desktop/src/components/git-graph/GitGraph.tsx#L588)) **dans** `useGitGraphActions.ts` existant | — | Ces effets appellent déjà l'API que `useGitGraphActions` retourne — les y déplacer plutôt que créer un 4ᵉ hook de plus | `describe('GitGraph — commit menu requested from outside (sidebar tag rows)', …)` [L1168](apps/desktop/src/components/git-graph/GitGraph.test.tsx#L1168) |

**Angle mort identifié** : `handleBisectPick` ([ligne 165](apps/desktop/src/components/git-graph/GitGraph.tsx#L165)) et le calcul de `wipAgentActivity`/`agentActivityPaths` ([lignes 288–305](apps/desktop/src/components/git-graph/GitGraph.tsx#L288)) n'ont **pas** de `describe` dédié trouvé dans GitGraph.test.tsx. Pas bloquant, mais ces deux blocs devront soit être extraits en dernier (une fois le reste validé et le diff réduit au minimum), soit recevoir un test ciblé avant d'être déplacés.

**Duplication réelle (pas une coïncidence)** — le wrapper resize-handle + largeur du panneau latéral est **répété à l'identique 6 fois** :
```
<div {...resizeProps} className="group relative w-2 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/40">
  <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
</div>
<div className="h-full min-w-[350px] shrink-0 overflow-hidden" style={{ width: panelWidthState }}>
  {/* contenu variable */}
</div>
```
aux lignes [1105–1117](apps/desktop/src/components/git-graph/GitGraph.tsx#L1105), [1120–1129](apps/desktop/src/components/git-graph/GitGraph.tsx#L1120), [1181–1193](apps/desktop/src/components/git-graph/GitGraph.tsx#L1181), [1196–1208](apps/desktop/src/components/git-graph/GitGraph.tsx#L1196), [1212–1224](apps/desktop/src/components/git-graph/GitGraph.tsx#L1212), [1229–1238](apps/desktop/src/components/git-graph/GitGraph.tsx#L1229) — seul le contenu enfant change. Extraction en un composant `<GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>{children}</GraphSidePanel>` : -60 lignes environ, un seul endroit à ajuster si le comportement de resize change.

**Commentaires en français à traduire** (convention CLAUDE.md, à faire dans le même passage puisqu'on rouvre le fichier) : [ligne 83](apps/desktop/src/components/git-graph/GitGraph.tsx#L83) *"Recherche globale issue de la barre d'actions (Partie 2)."*, [ligne 307](apps/desktop/src/components/git-graph/GitGraph.tsx#L307) *"── Colonnes ──"*, [ligne 310](apps/desktop/src/components/git-graph/GitGraph.tsx#L310) *"── Filtre par auteur (colonne « auteur ») ──"*, [ligne 1228](apps/desktop/src/components/git-graph/GitGraph.tsx#L1228) *"Handle de redimensionnement"*.

**Configuration à extraire** : les deux chaînes de priorité (quel panneau central §832–892, quel panneau latéral §1103–1265 s'affiche) sont aujourd'hui une cascade de ternaires JSX. Un objet de config `CENTER_VIEW_PRIORITY` / `SIDE_PANEL_PRIORITY` (même esprit que `columns.config.ts`) rendrait l'ordre de priorité lisible d'un coup d'œil et testable indépendamment du rendu — mais c'est un gain de lisibilité, pas un bug ; à faire **après** les extractions de hooks, pas avant (ne pas mélanger un changement de structure JSX avec l'extraction de state).

Après ces extractions, GitGraph.tsx devrait tomber à environ **450–500 lignes** de composition + JSX, chaque hook testable isolément en plus du test de composant existant qui continue de passer.

### 8.2 [git.api.ts](apps/desktop/src/api/git.api.ts) — un seul fichier pour 9 domaines (P0/P1)

Le fichier a un **noyau partagé** en tête ([lignes 101–225](apps/desktop/src/api/git.api.ts#L101)) : `generateId`, `pushAction`, `clearRedo`, `pendingRebasePreviousOid`, `settleRebase`, `raiseHookFailureCard`, `withHookFailureCard`. **Toutes** les fonctions du fichier, quel que soit leur domaine, s'appuient sur un sous-ensemble de ce noyau (undo/redo, notch d'échec de hook). Ça change l'ordre du découpage : on ne peut pas scinder par domaine avant d'avoir sorti ce noyau dans son propre module — sinon chaque nouveau fichier de domaine dupliquerait `pushAction`/`clearRedo`/etc.

Le test associé ([git.api.test.ts](apps/desktop/src/api/git.api.test.ts), 806 lignes, 81 `describe`/`it`) doit être scindé **dans le même mouvement** que le source, au même découpage par domaine — sinon il devient à son tour un fichier fourre-tout de 806 lignes testant 9 fichiers différents.

| Nouveau fichier | Fonctions regroupées (préfixe) | Lignes source approx. |
|---|---|---|
| `api/git/gitApiShared.ts` | `generateId`, `pushAction`, `clearRedo`, `settleRebase`, `raiseHookFailureCard`, `withHookFailureCard` | 101–225 |
| `api/git/git-commit.api.ts` | `apiStageFile`…`apiDiscardFileChanges` | 233–330 |
| `api/git/git-fixup.api.ts` | `apiCheckFixupTarget`…`apiGetPendingFixups` | 330–403 |
| `api/git/git-patch.api.ts` | `apiCreatePatch`…`apiCommitDependencyPatch` | 563–600 |
| `api/git/git-stash.api.ts` | `apiStashPush`…`apiStashList` | 600–706 |
| `api/git/git-branch.api.ts` | `apiCheckoutBranch`, `apiMergeBranch`, `apiCreateBranch`, `apiRenameBranch`, `apiCreateTag`, `apiDeleteTag`… | 706–1218 (dispersé) |
| `api/git/git-remote.api.ts` | `apiGetRemotes`, `apiFetchRemote`, `apiPullBranch`, `apiPushBranch(To)`, `apiRemoveRemote` | 807–1253 (dispersé) |
| `api/git/git-log.api.ts` | `apiGetLog`, `apiGetCommitDiff`, `apiGetFileDiff`, `apiBlameFile`, `apiGetFileHistory`… | 854–948 |
| `api/git/git-bisect.api.ts` | `apiGetBisectState`…`apiBisectReset` | 956–986 |
| `api/git/git-rebase.api.ts` | `apiRebaseOntoCommit`…`apiRunInteractiveRebase` | 519–563, 987–1022 |

`git.api.ts` redevient un **fichier barrel** (`export * from './git/git-commit.api'`, etc.) : les ~150 sites d'import existants (`from '../api/git.api'`) partout dans `apps/desktop/src` continuent de fonctionner sans être touchés — la migration des call-sites vers les nouveaux chemins peut se faire progressivement, PR par PR, plutôt qu'en un big-bang.

### 8.3 [RepositorySidebar.tsx](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx) — 624 lignes, 31 modifications (P1)

Deux extractions concrètes, avec test existant :

1. **8 dialogues + leur état d'ouverture** ([lignes 108–128](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx#L108) pour l'état, [556–621](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx#L556) pour le rendu : `AddWorktreeDialog`, `RemoveWorktreeDialog`, `PruneWorktreesDialog`, `RemoveMergedWorktreesDialog`, `RemoveMergedBranchesDialog`, `PruneBranchesDialog`, `CreateBranchHereDialog`, `CreateIssueDialog`, `SavedFilterDialog`). Ce n'est **pas un nouveau pattern à inventer** : GitGraph.tsx a déjà exactement ce découpage avec [GitGraphOverlayManager](apps/desktop/src/components/git-graph/components/GitGraphOverlayManager.test.tsx) et [TagDialogsManager](apps/desktop/src/components/git-graph/components/TagDialogsManager.tsx) — il suffit de reproduire le même pattern ici (`SidebarDialogsManager`) plutôt que d'en concevoir un nouveau. [RepositorySidebar.test.tsx](apps/desktop/src/components/repository-sidebar/RepositorySidebar.test.tsx) couvre déjà le composant, donc ce test continue de protéger le comportement une fois les dialogues déplacés (import différent, même rendu).
2. **Config des actions d'en-tête de section** ([lignes 447–493](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx#L447)) : 10 ternaires `section.key === 'local' ? fn : undefined` / `section.key === 'worktrees' ? fn : undefined` / etc. passés en props à `SidebarSectionHeader`. À remplacer par une table `SECTION_HEADER_ACTIONS: Partial<Record<SectionKey, SectionHeaderActionHandlers>>` construite une fois, dans le même esprit que `columns.config.ts`.

### 8.4 [GraphRow.tsx](apps/desktop/src/components/git-graph/GraphRow.tsx) — reclassé P1 → P2 après lecture

À la lecture complète, ce fichier **n'est pas un god component** malgré son churn élevé (39 modifications) : il est déjà scindé en deux responsabilités propres — `CellContent` (switch de rendu par type de colonne, [lignes 88–314](apps/desktop/src/components/git-graph/GraphRow.tsx#L88)) et `GraphRow` lui-même (structure de ligne + positionnement, [lignes 345–557](apps/desktop/src/components/git-graph/GraphRow.tsx#L345)). Le churn s'explique par l'ajout organique de fonctionnalités (ligne WIP, ligne worktree, ligne conflit, statut bisect, saisie de tag inline) sur une structure qui reste cohérente — pas par du désordre. **Rien à extraire ici.** Seule amélioration mineure, optionnelle : fusionner les trois tables parallèles `BISECT_STRIPE`/`BISECT_ROW_BG`/`BISECT_LABEL` ([lignes 319–343](apps/desktop/src/components/git-graph/GraphRow.tsx#L319)) en une seule `BISECT_STATUS_CONFIG: Record<BisectRowStatus, {stripe, rowBg, label}>` — cosmétique, aucun gain de maintenabilité significatif, à ne faire que si on touche ce fichier pour autre chose.

### 8.5 Confirmation additionnelle : [graphContextMenus.ts](apps/desktop/src/lib/graphContextMenus.ts) — gros mais sain, à ne pas toucher

1258 lignes mais **29 fonctions** (`branchItemContext`, `pullPushSection`, `syncSection`, `buildBranchSubmenu`, `buildStashMenuSpec`…) à ~43 lignes/fonction en moyenne — déjà décomposé en petites fonctions de construction par section de menu, composées dans les `buildXMenuSpec` de haut niveau. Absent du top 40 des fichiers les plus modifiés (< 20 modifications) : gros parce que le nombre de menus contextuels réels est grand, pas parce que c'est mal structuré. Même verdict que `git_remote.rs` en §6 : ne pas toucher sans raison concrète.

## 9. Plan d'action — tableau de synthèse

| Problème | Fichiers concernés | Sévérité | Effort | Gain attendu |
|---|---|---|---|---|
| Noyau undo/redo + hook-failure dupliqué en tête de fichier | [git.api.ts:101-225](apps/desktop/src/api/git.api.ts#L101) | P0 | S | Débloque le découpage par domaine sans dupliquer 7 helpers partagés |
| 9 domaines métier dans un seul fichier API | [git.api.ts](apps/desktop/src/api/git.api.ts) + [git.api.test.ts](apps/desktop/src/api/git.api.test.ts) | P0 | M | Navigation par domaine, PRs plus petites, conflits de merge réduits sur un fichier à fort churn (40 modifications) |
| God component : ~33 hooks / 7 responsabilités dans un seul fichier | [GitGraph.tsx](apps/desktop/src/components/git-graph/GitGraph.tsx) | P0 | L | Fichier le plus modifié du repo (72×) ramené à ~450-500 lignes, chaque concern testable isolément |
| Duplication x6 du wrapper resize-handle | [GitGraph.tsx:1105-1238](apps/desktop/src/components/git-graph/GitGraph.tsx#L1105) | P1 | S | -60 lignes, un seul point de vérité pour le comportement de resize |
| 8 dialogues + état gérés en ligne, pattern déjà résolu ailleurs | [RepositorySidebar.tsx:108-128,556-621](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx#L108) | P1 | M | Réutilise le pattern `*DialogsManager`/`*OverlayManager` déjà validé sur GitGraph.tsx |
| Ternaires répétés pour les actions d'en-tête de section | [RepositorySidebar.tsx:447-493](apps/desktop/src/components/repository-sidebar/RepositorySidebar.tsx#L447) | P2 | S | Table de config lisible, même esprit que `columns.config.ts` |
| Commentaires en français (4 occurrences) | [GitGraph.tsx](apps/desktop/src/components/git-graph/GitGraph.tsx#L83) (×4), [columns.config.ts](apps/desktop/src/components/git-graph/columns.config.ts) (fichier entier) | P2 | S | Conformité à la convention "tout le code en anglais" |
| 3 tables bisect parallèles | [GraphRow.tsx:319-343](apps/desktop/src/components/git-graph/GraphRow.tsx#L319) | P2 | S | Cosmétique — optionnel |

## 10. Ordre d'exécution (chaque étape validée par les tests existants avant de passer à la suivante)

1. **`git.api.ts` — extraire le noyau partagé** vers `api/git/gitApiShared.ts` (aucun changement de comportement, juste un déplacement d'imports). Valider : `pnpm --filter @git-manager/desktop test git.api`.
2. **`git.api.ts` — split par domaine** derrière le fichier barrel, un domaine à la fois (commit → fixup → patch → stash → branch → remote → log → bisect → rebase), en déplaçant les `describe` correspondants du même coup dans `git.api.test.ts` vers le fichier de test co-localisé. Valider après **chaque** domaine, pas à la fin.
3. **GitGraph.tsx — `useGraphLayout`** (le seul bloc 100% pur, donc le plus sûr). Valider avec les 3 `describe` cités en §8.1.
4. **GitGraph.tsx — `useRebaseGraphView`**, puis **`useGraphScrollSync`**, puis **`useConflictMergeWindow`**, puis **`useSearchNavigation`** — un hook à la fois, test ciblé après chacun.
5. **GitGraph.tsx — replier le pont `pendingGraphAction`/`pendingCommitMenuOid` dans `useGitGraphActions.ts`.**
6. **GitGraph.tsx — dédupliquer le wrapper resize-handle** (`GraphSidePanel`) + traduire les 4 commentaires français.
7. **RepositorySidebar.tsx — `SidebarDialogsManager`**, en copiant le pattern de `GitGraphOverlayManager`/`TagDialogsManager`.
8. **RepositorySidebar.tsx — `sectionHeaderActions.config.ts`.**
9. *(optionnel, quand le fichier sera de toute façon rouvert)* `columns.config.ts` : traduire les commentaires français ; `GraphRow.tsx` : fusionner les 3 tables bisect.

Chaque étape est un commit isolé et revertable indépendamment — pas un gros PR "refactor GitGraph".

## 11. À ne pas toucher (confirmé après lecture complète)

- [git_remote.rs](apps/desktop/src-tauri/src/services/git_remote.rs) (1830 lignes, 12 modifications) et [graphContextMenus.ts](apps/desktop/src/lib/graphContextMenus.ts) (1258 lignes, <20 modifications) : gros mais déjà bien décomposés en petites fonctions, et stables. Le risque de casser quelque chose dépasse le gain de lisibilité.
- [GraphRow.tsx](apps/desktop/src/components/git-graph/GraphRow.tsx) : reclassé après lecture complète (§8.4) — déjà correctement scindé, le churn vient de l'ajout organique de features, pas du désordre.
- [tauri.ts](apps/desktop/src/lib/tauri.ts), [lib.rs](apps/desktop/src-tauri/src/lib.rs), locales i18n : churn mécanique et attendu, déjà noté en §6.
- Cluster `package_health.rs`/`package_changelog.rs`/`package_usage.rs`/`dependency_patch.rs` : trop récent (1 commit) pour juger.

## 12. Prérequis sécurité par zone

- **GitGraph.tsx** : test existant très complet (81 blocs) — couvre presque 1:1 chaque extraction proposée (§8.1). Seuls angles morts : `handleBisectPick` et le calcul `wipAgentActivity`/`agentActivityPaths` — les extraire en dernier, ou ajouter un test ciblé avant de les déplacer.
- **git.api.ts** : 81 blocs dans [git.api.test.ts](apps/desktop/src/api/git.api.test.ts) — à faire migrer domaine par domaine avec le source, jamais laissé désynchronisé (sinon on perd la correspondance 1:1 qui fait la sécurité du déplacement).
- **RepositorySidebar.tsx** : [RepositorySidebar.test.tsx](apps/desktop/src/components/repository-sidebar/RepositorySidebar.test.tsx) existe déjà, à relire avant l'extraction pour confirmer qu'il couvre l'ouverture des 8 dialogues (pas vérifié en détail — à faire au moment de l'étape 7).
- **Nouveaux fichiers extraits** (hooks, fichiers de config) : au-delà de garder le test du composant parent au vert, chacun doit recevoir son propre test co-localisé (convention `test-coverage-guardian` du repo) — un hook pur comme `useGraphLayout` se teste trivialement avec des inputs synthétiques, sans monter tout GitGraph.
- Lancer les tests **après chaque étape** de la séquence en §10, jamais en fin de séquence groupée — c'est ce qui rend le déplacement réversible immédiatement en cas de régression.

## 13. Ce qu'il me reste à confirmer avant de commencer à coder

1. Je découpe `git.api.ts` derrière un fichier barrel (import paths existants intacts) plutôt que de migrer tous les call-sites en une fois — d'accord ?
2. Pour GitGraph.tsx, je pars dans l'ordre du §10 (le plus pur d'abord) — d'accord, ou préfères-tu que je commence par la dédup du resize-handle (gain visible immédiat, risque quasi nul) ?
3. Je n'ai toujours pas lancé `cargo clippy`/`cargo fmt` ni `pnpm lint`/`pnpm typecheck` (lecture seule, aucun `--fix`) — je le fais avant de commencer à coder pour capter d'éventuels signaux automatisés sur les fichiers concernés, sauf objection ?

Dès ton feu vert, je commence l'implémentation dans l'ordre du §10, un commit par étape.

## 14. Méthodologie capitalisée (pour ne pas refaire cet audit à chaque fois)

La méthode décrite en §7-11 (extraction mappée aux tests existants, réutilisation d'un pattern déjà résolu ailleurs plutôt qu'en inventer un nouveau, fichier barrel pour scinder un gros agrégat multi-domaine, fichiers `*.config.ts` pour remplacer les cascades de ternaires) est maintenant capitalisée à deux endroits durables, pas seulement dans ce document ponctuel :

- **[.claude/skills/architecture-guardian/SKILL.md](.claude/skills/architecture-guardian/SKILL.md)**, nouvelle règle **R3** — c'est là que vit la méthode, avec les exemples concrets de cet audit (GitGraph.tsx, git.api.ts, RepositorySidebar.tsx) et la correction du faux-positif GraphRow.tsx. Ce skill se déclenche automatiquement dès qu'on touche un fichier déjà gros ou qu'on demande comment scinder un composant/hook.
- **[CLAUDE.md](CLAUDE.md)** : pointeur étendu vers R3, + une nouvelle règle dans "Frontend organization rules" sur le pattern `*.config.ts` (référence : `columns.config.ts`).

J'en ai profité pour corriger au passage une référence obsolète dans le skill : son étape 4 pointait vers `docs/architecture/2026-07-architecture-refactor-tracking.md` pour y logger les nouvelles violations trouvées, alors que ce fichier affiche lui-même en en-tête "Finished, and not to be updated" depuis juillet 2026 — exactement le genre d'erreur (une instruction qui pointe vers un document gelé) que cette mise à jour vise à éviter de reproduire. Ce document (`AUDIT.md`) reste un artefact ponctuel de cet audit, pas un document vivant à maintenir — c'est le skill et CLAUDE.md qui portent la règle dans la durée.

## 15. Bilan d'exécution (2026-08-02)

Les 9 étapes du §10 sont faites, un commit par étape, avec `typecheck` + `lint` + la suite de tests complète après chacune. Trois écarts par rapport au plan, tous dans le sens de l'ajout :

- **`api/git/git-rollback.api.ts` n'était pas prévu.** Le découpage en 9 domaines du §8.2 avait oublié `apiRevertCommit`/`apiResetToCommit`, qui ne rentrent proprement dans aucun des 9 — ils reflètent le service Rust `git_rollback.rs`, qui est séparé pour la même raison. Dixième fichier, pas neuvième.
- **L'étape 9, marquée optionnelle, a été faite.** Les commentaires de `columns.config.ts` sont traduits, et les 3 tables bisect de `GraphRow.tsx` fusionnées en une seule table `bisectRow.config.ts` — avec le test de rendu du marqueur bisect qui n'existait pas, ajouté *avant* le déplacement conformément à R3.
- **Une duplication non trouvée par l'audit** l'a été en traitant l'angle mort du §12. Le prédicat « cette ligne n'est pas un vrai commit » (`WIP` / `WIP:<path>` / `CONFLICT`) était réécrit à 11 endroits sous trois formes différentes, dont deux qui omettaient le cas `WIP:`. Centralisé dans `syntheticRows.ts`. C'est le type de duplication que le §2 aurait dû lever : elle est invisible à un `grep` sur un nom de fonction, puisque chaque site réécrivait la condition à la main.

Restent volontairement non traités, et non bloquants :

- `handleBisectPick` et le calcul `wipAgentActivity`/`agentActivityPaths` de `GitGraph.tsx` (angle mort du §12) restent en place. `handleBisectPick` se réduit désormais à un appel de `isSyntheticRow` + un appel de store, donc il n'y a plus grand-chose à extraire ; les deux `useMemo` d'activité agent restent un candidat de hook si le fichier est rouvert.
- L'idée `CENTER_VIEW_PRIORITY`/`SIDE_PANEL_PRIORITY` évoquée en §8.1 n'a jamais été planifiée en tâche et reste disponible.
- `useGitGraphActions.ts` est passé de 719 à ~775 lignes en absorbant les deux ponts (étape 5). C'est une seule responsabilité cohérente, mais `openMenuAt` y fait à lui seul ~400 lignes et n'a jamais été examiné comme candidat à un découpage par catégorie d'action.
- ~~Les commentaires français hors périmètre~~ — finalement traités : 24 fichiers balayés sur tout le dépôt (Rust inclus). La détection par accents seule était insuffisante, plusieurs commentaires français n'en portent aucun ; il a fallu un second passage sur les mots-outils français.
- **Chaînes visibles par l'utilisateur codées en dur en français** — un problème *différent* et plus grave, découvert pendant ce balayage : 9 occurrences violent l'invariant i18n et s'affichent en français quelle que soit la langue choisie. Voir la liste en §16.
- `packages/components`'s `InnerTab` reste utilisé : il rend les 6 onglets de la page Pull Requests / Launchpad ([PullRequestsPage.tsx:307](apps/desktop/src/app/pull-requests/PullRequestsPage.tsx#L307)). Le retrait des onglets de vue ne lui a enlevé qu'un consommateur sur deux.

## 16. Chaînes en dur en français (trouvé le 2026-08-02, NON corrigé)

Découvert en balayant les commentaires : 8 chaînes **visibles par l'utilisateur** sont écrites en dur en français dans le JSX, au lieu de passer par `t()`. Elles s'affichent donc en français même quand l'application est en anglais — c'est un bug utilisateur, pas une question de style, et ça viole l'invariant i18n du CLAUDE.md.

| Fichier | Ligne | Chaîne |
| --- | --- | --- |
| [ExternalToolsSection.tsx](apps/desktop/src/app/settings/components/ExternalToolsSection.tsx#L39) | 39 | `pickApplication("Sélectionner l'application de l'éditeur")` |
| [ExternalToolsSection.tsx](apps/desktop/src/app/settings/components/ExternalToolsSection.tsx#L44) | 44 | `pickApplication("Sélectionner l'application du terminal")` |
| [ExternalToolsSection.tsx](apps/desktop/src/app/settings/components/ExternalToolsSection.tsx#L58) | 58 | `<Highlight text="Éditeur de code externe" />` |
| [ExternalToolsSection.tsx](apps/desktop/src/app/settings/components/ExternalToolsSection.tsx#L103) | 103 | `Sélectionner mon éditeur…` |
| [ExternalToolsSection.tsx](apps/desktop/src/app/settings/components/ExternalToolsSection.tsx#L162) | 162 | `Sélectionner mon terminal…` |
| [GeneralSection.tsx](apps/desktop/src/app/settings/components/GeneralSection.tsx#L84) | 84 | `<Highlight text="Identité Git par défaut" />` |
| [TabBar.tsx](apps/desktop/src/components/tab-bar/TabBar.tsx#L112) | 112 | `label="Succès & Trophées"` |
| [TabBar.tsx](apps/desktop/src/components/tab-bar/TabBar.tsx#L237) | 237 | `title="Réglages"` |

Non corrigé ici parce que ce n'est pas un renommage : chacune demande une clé i18n ajoutée **dans les deux locales**, et les deux `<Highlight text=…>` alimentent en plus la recherche des réglages, dont il faut vérifier qu'elle reste cohérente une fois le libellé traduit. À traiter comme un lot séparé.

Un neuvième cas a été écarté après vérification : [WipStagingPanel.tsx:386](apps/desktop/src/components/git-graph/components/WipStagingPanel.tsx#L386) passe `defaultValue: 'Amender le commit précédent'` à `t('conflictEditor.amendPreviousCommit')`, mais cette clé existe dans les deux locales — le fallback n'est donc jamais atteint. C'est du code mort en français, pas un bug d'affichage ; à nettoyer, sans urgence.

À noter, à ne PAS confondre avec ce qui précède : les props `match={...}` des sections de réglages contiennent volontairement des mots-clés français (`thème`, `identité`, `profondeur`…). Ce sont des synonymes de recherche, pas du texte affiché — les laisser tels quels.
