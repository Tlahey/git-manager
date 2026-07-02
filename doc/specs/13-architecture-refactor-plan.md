# Spec 13 — Plan de refactoring architecture

## Objectif

Ce document est un **plan réutilisable**, pas une spec de feature : il sert de référence à chaque
fois qu'on touche à une zone du code qui viole les règles de découpage ci-dessous, et de checklist
avant de fusionner une PR qui ajoute une commande Tauri, un composant, un hook ou un store.

Il part d'un audit factuel du code (juillet 2026, voir § État des lieux) et fixe :
1. les règles de découpage à respecter (fichier = 1 rôle, service layer obligatoire),
2. les design patterns à introduire et où,
3. une roadmap priorisée,
4. les garde-fous automatisés (agent + skill Claude Code) pour ne pas régresser.

**Exécution** : le suivi action-par-action de ce plan (statut, ordre, dépendances) est dans
[14-architecture-refactor-tracking.md](14-architecture-refactor-tracking.md) — c'est ce fichier-là
qu'il faut consulter/mettre à jour pour savoir où on en est concrètement.

`doc/specs/00-architecture.md` reste la vue d'ensemble de la stack. Ce document-ci le complète :
là où `00-architecture.md` décrit une couche `git/` qui n'a jamais été implémentée (notée
"aspirationnelle" dans `CLAUDE.md`), ce plan **remplace** cette ambition par quelque chose de plus
proche du code réel : une couche `services/` côté Rust et un renforcement de la couche `api/*.api.ts`
côté frontend, plutôt qu'une réécriture complète.

---

## État des lieux (audit)

### Points forts à préserver
- La frontière IPC est respectée : le frontend ne parle jamais à git directement, tout passe par
  `#[tauri::command]` → `lib/tauri.ts`.
- La couche `api/*.api.ts` existe déjà et couvre ~95 % des commandes utilisées par le frontend
  (`git.api.ts`, `github.api.ts`, `nativeMenu.api.ts`, `repo.api.ts`, `shell.api.ts`, `ssh.api.ts`,
  `theme.api.ts`, `ollama.api.ts`).
- Un Observer existe déjà : [`lib/gameObserver.ts`](../../apps/desktop/src/lib/gameObserver.ts), un
  petit pub/sub utilisé par `game.store.ts` et `api/git.api.ts` pour notifier les achievements sur
  stage/unstage/commit. C'est la base à généraliser (voir § Observer).
- Les events Tauri (`app_handle.emit` / `listen`) sont déjà utilisés pour le streaming Ollama —
  c'est un second canal Observer, côté Rust→Frontend cette fois.

### Violations identifiées

**Frontend — fichiers qui mélangent plusieurs responsabilités :**

| Fichier | Lignes | Problème |
|---|---|---|
| `components/git-graph/components/CommitFileList.tsx` | 682 | logique d'arbre de fichiers + UI + appels stage/unstage dans un seul fichier |
| `components/git-graph/GitGraph.tsx` | 586 | composant orchestrateur qui absorbe trop de coordination |
| `app/settings/components/GithubSection.tsx` | 562 | tout le device flow OAuth (polling, state, timers) est inline dans le composant au lieu d'un hook dédié |
| `components/git-graph/components/WipStagingPanel.tsx` | 488 | arbre de fichiers + interactions + formatage mélangés |
| `app/pull-requests/components/CustomViewsTab.tsx` | 454 | parsing YAML + construction de requête GitHub + formulaire UI |
| `components/git-graph/DiffViewCenter.tsx` | 427 | virtualisation + interactions stage/unstage directement couplées à la vue |

**Frontend — violation de la couche API :**
- `stores/game.store.ts:228` appelle `invoke('get_terminal_commands')` **directement**, en
  contournant `lib/tauri.ts` et `api/*.api.ts`. C'est la seule violation trouvée mais elle illustre
  le risque : un store qui court-circuite la couche service ne peut pas être observé/tracé de
  manière uniforme.

**Frontend — store qui mélange UI et données métier :**
- `stores/repos.store.ts` (209 lignes) mélange état UI pur (onglets ouverts, panneau actif, fichier
  de diff sélectionné) et données métier (repo actif, messages WIP, stashes masqués).
- `stores/settings.store.ts` mélange config métier (Ollama, branches protégées, GitHub) et
  préférences UI (apparence).

**Backend Rust — duplication et fichiers trop gros :**

| Fichier | Lignes | Problème |
|---|---|---|
| `commands/log.rs` | 816 | mélange calcul du graphe (colonnes/couleurs/edges), parsing des commits, filtrage des stashes et génération de diffs complets |
| `commands/commit.rs` | 649 | 6 commandes distinctes (stage, unstage, commit, discard, diff, raw content) dans un seul fichier |
| `commands/repo.rs` | 611 | logique de scan/clone/init non factorisée |

- **`DiffLine` / `DiffHunk` / `DiffFile` / `CommitDiff` sont redéfinis à l'identique** dans
  `commands/commit.rs` (lignes 10-44) et `commands/log.rs` (lignes 38-70). Deux sources de vérité
  pour la même donnée sérialisée vers `packages/git-types`.
- Le raccourcissement de SHA (`sha[..7.min(sha.len())]`) est réécrit dans `rollback.rs`, `remote.rs`,
  `log.rs`, `commit.rs` au lieu d'une fonction utilitaire unique.
- `build_git_repo()` (`repo.rs:64-111`) et la logique équivalente dans `open_repo()` (`repo.rs:9-60`)
  se recouvrent partiellement.
- Chaque commande accède à `git2` directement et mélange validation métier (branche protégée,
  confirmation destructive) + accès disque + sérialisation — rien n'est réutilisable hors du
  contexte `#[tauri::command]`, donc rien n'est testable indépendamment de Tauri.

---

## Principes cibles

Ces règles sont **contraignantes**, pas des suggestions. Elles complètent (sans les remplacer)
`.agents/AGENTS.md` et la section Architecture de `CLAUDE.md`.

### R1 — Un fichier, un rôle
Un fichier ne doit avoir qu'une seule raison de changer. Concrètement :
- Un composant `.tsx` = une feature affichée. Toute logique non-présentationnelle (construction
  d'arbre, polling, parsing) part dans un hook dédié (`hooks/useX.ts`).
- Un module Rust de `commands/` ne doit exposer que des fonctions `#[tauri::command]` **minces** :
  désérialiser l'input, appeler un service, sérialiser l'output, mapper l'erreur. Toute la logique
  métier (parcours git2, calculs, validations) part dans `services/`.

### R2 — Toutes les opérations passent obligatoirement par un service
C'est la règle demandée explicitement et elle a un intérêt direct pour l'Observer : si un seul
point d'entrée exécute *toutes* les opérations, c'est le seul endroit où brancher des side-effects
transverses (notifications, historique undo/redo, achievements, futur audit log) sans les
dupliquer à chaque call site.

- **Frontend** : plus aucun composant, hook ou store n'appelle `invoke()` directement — pas même
  via `lib/tauri.ts` sans passer par `api/*.api.ts`. Aujourd'hui `lib/tauri.ts` est déjà la seule
  porte vers `invoke`, mais certains composants importent `lib/tauri.ts` directement en sautant la
  couche `api/`. Cible : **tous les appels métier passent par `api/*.api.ts`**, et chaque fichier
  `api/*.api.ts` passe par un wrapper commun (voir Observer ci-dessous) plutôt que d'appeler
  `lib/tauri.ts` en direct partout où c'est pratique.
- **Backend** : chaque commande appelle exactement un service (`services::git::stage_file(...)`,
  `services::branch::delete(...)`, etc). Le service est la seule couche autorisée à toucher `git2`.

### R3 — Design patterns, appliqués là où ils résolvent un vrai problème
Pas de pattern pour le plaisir du pattern — chaque introduction ci-dessous répond à une duplication
ou un couplage observé dans l'audit.

---

## Patterns à introduire

### Observer — généraliser `gameObserver` en bus d'événements applicatif
**Problème résolu** : aujourd'hui seul `api/git.api.ts` notifie `gameObserver` (pour les
achievements). Les autres domaines (GitHub, stash, remote) n'ont aucun point d'instrumentation
commun ; si demain on veut ajouter un audit log ou améliorer l'historique undo/redo, il faudra
ajouter des appels manuels dans chaque fonction API.

**Cible** :
- Renommer/étendre `lib/gameObserver.ts` en `lib/appEventBus.ts` (ou garder le nom, mais ouvrir les
  types d'événements au-delà de la gamification : `git:stage`, `git:commit`, `github:auth`,
  `remote:push`, etc.).
- Introduire un wrapper unique côté frontend, ex. `api/service.ts` :
  ```ts
  export async function callCommand<T>(name: AppEvent, invokeFn: () => Promise<T>): Promise<T> {
    const result = await invokeFn()
    appEventBus.emit(name, result)
    return result
  }
  ```
  Chaque fonction de `api/*.api.ts` passe par `callCommand` au lieu d'appeler `invoke`/`lib/tauri.ts`
  nue. `game.store.ts`, `undoHistory.store.ts`, un futur logger, etc. s'abonnent au même bus au lieu
  de coder leur propre notification ad hoc.
- Côté Rust, le pattern Observer existe déjà via `app_handle.emit()` pour le streaming (Ollama). Le
  généraliser pour émettre un événement `command:executed` (nom, durée, succès/échec) depuis la
  couche `services/` serait la contrepartie backend — utile pour le futur historique undo/redo
  serveur-side sans dupliquer la logique dans chaque commande.

### Service layer (Rust) — extraire `services/` entre `commands/` et `git2`
**Problème résolu** : `log.rs` (816 lignes) et `commit.rs` (649 lignes) mélangent logique métier et
plomberie Tauri, rendent le code non testable hors `#[tauri::command]`, et dupliquent les structs
`DiffLine`/`DiffHunk`/`DiffFile`.

**Cible** :
```
src-tauri/src/
├── commands/         # fonctions #[tauri::command] minces : désérialisation + délégation + erreurs
│   ├── log.rs
│   ├── commit.rs
│   └── ...
├── services/          # logique métier pure, testable sans Tauri
│   ├── git_log.rs      # parcours d'historique (ex log.rs sans le rendu graphe)
│   ├── git_graph.rs     # calcul colonnes/couleurs/edges (Builder, voir plus bas)
│   ├── git_diff.rs      # génération de diffs — seule source de DiffLine/DiffHunk/DiffFile
│   ├── git_commit.rs    # stage/unstage/commit/discard
│   └── git_repo.rs      # open/scan/clone/init, build_git_repo unifié
├── models.rs           # structs partagées (DiffLine, DiffHunk, DiffFile, CommitDiff, ShortOid...)
└── utils.rs            # short_oid(), get_git_signature() — actuellement dupliqués 4x
```
Ceci résorbe directement la duplication de structs Diff et des helpers `short_oid`/signature
relevée dans l'audit, sans réécrire l'accès git2 existant (pas de couche d'abstraction
supplémentaire type `git/` façon `00-architecture.md` — juste un découpage commands/services).

### Builder — construction du graphe de commits et des options de diff
**Problème résolu** : `log.rs` calcule columns/couleurs/edges et les options de diff en ligne, avec
plusieurs paramètres optionnels (limite, filtres stash, contexte de diff) passés en cascade.

**Cible** : un `GitGraphBuilder` (`services/git_graph.rs`) avec des méthodes chaînables
(`.with_limit()`, `.include_stashes()`, `.from_ref()`) qui produit le graphe final, et un
`DiffOptionsBuilder` équivalent pour les diffs (contexte, whitespace, binaire). Rend `log.rs`
lisible et isole les paramètres actuellement dispersés en arguments de fonction.

### Strategy — rendu de diff selon le type de contenu
**Problème résolu** : `DiffViewCenter.tsx` (427 lignes) mélange virtualisation, interactions et
logique de formatage qui varie selon le type de fichier (texte, binaire, image, renommage pur).

**Cible** : extraire une interface `DiffRenderStrategy` (texte split-view, binaire, image) au lieu
de `if/else` empilés dans le composant. Chaque stratégie devient un petit composant/fonction pure,
`DiffViewCenter` ne fait plus que sélectionner et virtualiser.

### Composite — arbre de fichiers (déjà implicite)
**Problème résolu** : `CommitFileList.tsx` et `WipStagingPanel.tsx` réimplémentent chacun leur
construction d'arbre de fichiers (`buildFileTree`, `computeFolderStats`).

**Cible** : un hook partagé `hooks/useFileTree.ts` qui prend une liste de chemins + statuts et
retourne une structure Composite (`FileNode | FolderNode`), consommé par les deux composants. Un
seul endroit pour le tri, le calcul des stats de dossier, le filtrage.

---

## Plan d'action détaillé par fichier

### Backend Rust
1. Créer `models.rs` (ou étendre l'existant) avec `DiffLine`, `DiffHunk`, `DiffFile`, `CommitDiff`
   comme unique définition ; supprimer les redéfinitions dans `commit.rs` et `log.rs`.
2. Créer `utils.rs` avec `short_oid()` et `get_git_signature()` ; remplacer les 4 occurrences
   dupliquées (`rollback.rs`, `remote.rs`, `log.rs`, `commit.rs`).
3. Extraire `services/git_diff.rs` (génération de diff, utilisé par `commit.rs` et `log.rs`).
4. Extraire `services/git_graph.rs` (calcul du graphe avec `GitGraphBuilder`) hors de `log.rs`.
5. Extraire `services/git_commit.rs` (stage/unstage/commit/discard) hors de `commit.rs`.
6. Unifier `build_git_repo()` / `open_repo()` dans `services/git_repo.rs`.
7. Une fois 1-6 faits, `commands/log.rs` et `commands/commit.rs` ne devraient plus dépasser ~150
   lignes chacun (désérialisation + appel service + erreurs).

### Frontend
1. `GithubSection.tsx` → extraire `hooks/useGithubDeviceFlow.ts` (polling, state, cleanup des
   timers) ; le composant ne garde que le rendu.
2. `CommitFileList.tsx` + `WipStagingPanel.tsx` → extraire `hooks/useFileTree.ts` partagé (voir
   Composite ci-dessus) ; les composants ne gardent que le rendu de l'arbre.
3. `DiffViewCenter.tsx` → extraire les stratégies de rendu par type de diff (Strategy ci-dessus).
4. `GitGraph.tsx` → vérifier si les 6+ hooks coordonnés peuvent être regroupés dans un hook de
   composition unique (`hooks/useGitGraphController.ts`) pour désencombrer le composant page.
5. `stores/repos.store.ts` → séparer en `stores/repoUI.store.ts` (onglets, panneau actif, sélection
   de diff) et `stores/repoData.store.ts` (repo actif, WIP messages, stashes masqués).
6. `stores/settings.store.ts` → séparer préférences UI (apparence) de config métier (Ollama,
   branches protégées, GitHub) si le store continue de grossir.
7. `stores/game.store.ts:228` → remplacer l'appel direct `invoke('get_terminal_commands')` par un
   export de `lib/tauri.ts` (`getTerminalCommands()`), lui-même appelé via `api/*.api.ts`.
8. Introduire `api/service.ts` (le `callCommand` décrit dans Observer) et migrer `api/*.api.ts` un
   fichier à la fois pour qu'ils passent tous par ce wrapper.

---

## Roadmap priorisée

**Phase 1 — Quick wins (peu de risque, valeur immédiate)**
- Corriger `game.store.ts:228` (violation de couche API).
- Centraliser `short_oid()` / `get_git_signature()` dans `utils.rs`.
- Centraliser les structs Diff dans `models.rs`.

**Phase 2 — Extraction de hooks (frontend, pas de changement de comportement)**
- `useGithubDeviceFlow`, `useFileTree`, séparation `repos.store.ts`.

**Phase 3 — Introduction du service layer (Rust)**
- Extraction `services/git_diff.rs`, `services/git_commit.rs`, `services/git_repo.rs`,
  `services/git_graph.rs` avec `GitGraphBuilder`.

**Phase 4 — Bus d'événements généralisé**
- `api/service.ts` + `appEventBus`, migration progressive de `api/*.api.ts`.

**Phase 5 — Strategy pour le rendu de diff**
- Une fois le reste stabilisé, refactor `DiffViewCenter.tsx`.

Chaque phase est indépendante et livrable séparément — ne pas tout faire dans une seule PR.

---

## Garde-fous automatisés

Pour ne pas reproduire ces violations sur les prochaines features, deux outils Claude Code ont été
ajoutés au repo :

- **Skill `architecture-guardian`** (`.claude/skills/architecture-guardian/SKILL.md`) — se déclenche
  quand on ajoute/modifie une commande Tauri, un composant, un hook, un store ou un fichier
  `api/*.api.ts`, et rappelle les règles R1/R2 avant d'écrire le code.
- **Agent `architecture-reviewer`** (`.claude/agents/architecture-reviewer.md`) — subagent de revue
  à invoquer après une implémentation ou avant une PR, qui vérifie taille de fichiers, respect de la
  couche service/API, et duplication, en s'appuyant sur ce document.

Ces deux outils référencent ce fichier comme source de vérité — le mettre à jour si les règles
évoluent plutôt que de dupliquer les règles ailleurs.
