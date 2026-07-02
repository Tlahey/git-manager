# Undo / Redo pour Checkout, Commit, Discard, Delete branch, Remove remote, Reset

> **Statut** : Phase 1 (ce document, ci-dessous) implémentée — Checkout, Commit, Discard,
> Delete branch, Remove remote, Reset, + Stash (push/pop/apply/drop) ajouté ensuite dans la
> même session. Voir la section **Phase 2 — Persistance** tout en bas pour l'extension en cours.

## Contexte

Le toolbar a déjà deux boutons `Undo2`/`Redo2` désactivés ("coming soon") dans
[ActionToolbar.tsx:202-213](apps/desktop/src/components/action-toolbar/ActionToolbar.tsx#L202-L213).
Aucun mécanisme d'historique de commandes n'existe : ni côté frontend (aucun store dédié),
ni côté backend (pas de reflog exposé, pas de snapshot avant action destructive). 3 des 6
actions demandées (Checkout, Delete branch, Remove remote) sont même appelées par le frontend
vers des commandes Tauri qui n'existent pas côté Rust ([lib.rs](apps/desktop/src-tauri/src/lib.rs)
ne les enregistre pas) — elles échoueraient au runtime aujourd'hui.

Recherche sur l'approche GitKraken : leur Undo est un **historique de commandes au niveau
applicatif** (pas une simple lecture du reflog Git — ils n'exposent d'ailleurs pas le reflog).
On reproduit ce principe : chaque action poussée dans l'historique porte ses propres fonctions
`undo()`/`redo()`. Pour les actions purement métadonnées (Checkout, Delete branch, Remove
remote, Reset soft/mixed), l'undo se fait en rejouant l'inverse avec l'état "avant" capturé en
mémoire. Pour les actions qui détruisent du contenu non committé (Discard, Reset hard, Checkout
forcé), on écrit un **objet Git orphelin** (blob ou commit non rattaché à aucune ref) avant
l'action — il n'apparaît dans aucun log, aucune liste de stash, aucune branche, et sera
naturellement nettoyé par le `git gc` (grâce period ~2 semaines par défaut). C'est le
"ne pollue pas l'historique visible" demandé, sans avoir à gérer une ref cachée ni un
nettoyage manuel.

Décisions déjà validées avec l'utilisateur :
- Stratégie undo destructif = snapshot automatique (objets Git orphelins), pas de vrai
  historique de reflog.
- On implémente aussi les 3 commandes backend manquantes (`checkout_branch`, `delete_branch`,
  `remove_remote`) — actuellement absentes de `src-tauri`.
- On active les boutons toolbar existants (`Undo2`/`Redo2`) + raccourcis clavier, pas de menu
  Edit natif séparé.

Hypothèses par défaut (à confirmer si besoin) : l'historique est **par dépôt**, plafonné à
**50 entrées**, **non persisté** (remis à zéro à la fermeture de l'app / de l'onglet du dépôt) —
comme le cache `repoCache` existant qui n'est pas persisté dans
[repos.store.ts](apps/desktop/src/stores/repos.store.ts#L195-L207).

---

## Mapping Action → Undo/Redo

| Action | Déclencheur UI | Undo | Redo |
|---|---|---|---|
| **Checkout** | `BranchContext.tsx` (dropdown toolbar) | Checkout vers la ref précédente (nom de branche, ou OID brut si HEAD était détaché). Si le workdir était sale et le checkout forcé, restaure le snapshot orphelin avant. | Re-checkout vers la ref cible d'origine. |
| **Commit** | `WorkingTreePanel.tsx`, `WipStagingPanel.tsx`, `GitGraph.tsx` (commit rapide) | `reset_to_commit(previousOid, mode="soft")` — remet les fichiers en staged, annule seulement le commit. Non proposé si c'est le tout premier commit du dépôt (pas de parent à restaurer). | `reset_to_commit(newOid, mode="soft")` — le commit objet existe toujours en base Git, on avance juste le pointeur. |
| **Discard** (fichier unique) | `DiffViewCenter.tsx`, `CommitFileList.tsx` | Réécrit le contenu du fichier depuis un **blob orphelin** capturé juste avant le discard ; re-stage si le fichier était staged avant. | Rejoue `discard_file_changes` (déterministe, l'état est redevenu identique à avant le 1er discard). |
| **Delete branch** | Nouveau menu contextuel sur `BranchItem.tsx` (à câbler, cf. plus bas) | Recrée la ref de branche pointant vers l'OID capturé avant suppression (+ upstream si connu). | Rejoue `delete_branch`. |
| **Remove remote** | Nouveau bouton sur `RemotesSection.tsx` (à créer, cf. plus bas) | `add_remote(name, url)` avec la config capturée avant suppression. | Rejoue `remove_remote`. |
| **Reset branch to commit** | `ResetDialog.tsx` | `reset_to_commit(previousOid, mode)`. Si le reset original était `hard` et le workdir était sale, restaure le snapshot orphelin (index + workdir) capturé avant. | `reset_to_commit(targetOid, mode)` d'origine. |

## Règles de la pile Undo/Redo

- Pile **par dépôt** (`repoPath`), plafonnée à **50 commandes** — au-delà, on droppe la plus
  ancienne (FIFO).
- Un pointeur `pointer` sépare undo-able (`[0, pointer)`) de redo-able (`[pointer, length)`).
- Pousser une nouvelle commande **tronque toute la queue redo** (comportement standard
  éditeur de texte).
- Toute action Git mutante qui n'est **pas** elle-même un undo/redo (fetch, pull, push, stash
  push/pop/apply/drop, revert, fixup, autosquash) **invalide aussi la queue redo** du dépôt
  concerné, même si elle n'est pas undoable elle-même — l'état du dépôt a divergé, rejouer un
  redo obsolète serait dangereux. C'est la réponse concrète à "on ne peut pas REDO si un
  changement a eu lieu après".
- Boutons toolbar activés seulement si `activeRepo` existe et `pointer > 0` (Undo) /
  `pointer < length` (Redo). Désactivés aussi pendant qu'une commande undo/redo est en cours
  d'exécution (réutilise le pattern `loading` existant de `ActionToolbar.tsx`).
- Raccourcis clavier `Cmd/Ctrl+Z` (undo) et `Cmd/Ctrl+Shift+Z` (redo), ignorés si le focus est
  dans un input/textarea/monaco (même garde que le hook existant).

---

## Backend Rust (`apps/desktop/src-tauri/src`)

### Nouvelles commandes branche — `commands/branch.rs`
- `checkout_branch(path, ref_name, force) -> Result<(), String>` : tente `repo.find_branch`
  (nom court) puis fallback `repo.revparse_single` (OID brut, pour restaurer un HEAD détaché) ;
  `repo.set_head(...)` + `repo.checkout_head/checkout_tree` avec `force` piloté par le paramètre.
- `delete_branch(path, name, force, delete_remote) -> Result<(), String>` : capture n'est PAS
  faite ici (elle est faite côté frontend avant l'appel, via `get_branches` déjà en cache) ;
  la commande elle-même se contente de supprimer la ref via `git2::Branch::delete`.
- `create_branch` reste **hors scope** de ce plan (bug préexistant indépendant, `BranchButton`
  l'appelle déjà mais échoue faute de commande backend — signalé en fin de plan, pas corrigé ici
  sauf demande explicite).

### Nouvelles commandes remote — `commands/remote.rs`
- `get_remotes(path) -> Result<Vec<RemoteInfo>, String>` avec
  `struct RemoteInfo { name: String, url: String, push_url: Option<String> }` — nécessaire car
  `GitRepo.remotes` actuel ([models.rs:15-24](apps/desktop/src-tauri/src/models.rs#L15-L24)) ne
  stocke que les URLs, pas les noms ([repo.rs:35-44](apps/desktop/src-tauri/src/commands/repo.rs#L35-L44)
  jette le nom après lookup) — indispensable pour construire l'UI de suppression et pour l'undo.
- `remove_remote(path, name) -> Result<(), String>` via `repo.remote_delete(&name)`.
- `add_remote(path, name, url) -> Result<(), String>` via `repo.remote(&name, &url)` — nécessaire
  pour l'undo de `remove_remote` (et pour le redo réutilise `remove_remote`).

### Snapshots orphelins — nouveau module `commands/undo.rs`
- `snapshot_file(path, file_path) -> Result<Option<String>, String>` : si le fichier existe,
  écrit son contenu en blob via `repo.blob(bytes)` (ne touche aucune ref) et retourne l'OID hex ;
  `None` si le fichier n'existe pas (rien à sauvegarder, ex. fichier déjà absent). Utilisé avant
  `discard_file_changes`.
- `restore_file_blob(path, file_path, blob_oid) -> Result<(), String>` : relit le blob et
  réécrit le fichier sur disque (recrée les dossiers parents si besoin).
- `snapshot_worktree(path) -> Result<Option<WorktreeSnapshot>, String>` avec
  `struct WorktreeSnapshot { index_tree_oid: String, workdir_tree_oid: String }` — construit un
  tree depuis l'index courant (`index.write_tree()`) et un second tree depuis un index temporaire
  qui scanne le workdir avec les fichiers non trackés inclus (`Index::new()` + `add_all` sur
  workdir) ; les deux sont enveloppés dans des commits factices non rattachés à une ref (mêmes
  garanties "orphelin" que pour les blobs). Retourne `None` si le workdir est déjà propre (rien à
  protéger). Utilisé avant `reset_to_commit(mode="hard")` et `checkout_branch(force=true)`
  lorsqu'il y a des changements non committés.
- `restore_worktree_snapshot(path, snapshot) -> Result<(), String>` : `checkout_tree` forcé sur
  le tree workdir, puis `index.read_tree` + `index.write()` sur le tree index — restaure la
  distinction staged/unstaged capturée.

### `discard_file_changes` — modification
- Avant la logique existante ([commit.rs:100-145](apps/desktop/src-tauri/src/commands/commit.rs#L100-L145)),
  appeler `snapshot_file` et capturer `was_staged` (statut actuel du fichier). Étendre le retour
  de `Result<(), String>` vers
  `Result<DiscardResult, String>` avec `struct DiscardResult { snapshot_blob_oid: Option<String>, was_untracked: bool, was_staged: bool }`.

### `create_commit` — modification
- Retourne aujourd'hui seulement le short SHA (7 chars) —
  [commit.rs:227-310](apps/desktop/src-tauri/src/commands/commit.rs#L227-L310). Étendre le retour
  vers `struct CommitResult { oid: String, short_oid: String }` pour que le frontend dispose de
  l'OID complet nécessaire au redo (`reset_to_commit` exige un OID exact). Mettre à jour les 5
  points d'appel listés plus bas.

### Enregistrement `lib.rs`
Ajouter au `generate_handler!` : `checkout_branch`, `delete_branch`, `get_remotes`,
`remove_remote`, `add_remote`, `snapshot_file`, `restore_file_blob`, `snapshot_worktree`,
`restore_worktree_snapshot`. Réutiliser `AppError` existant ([error.rs](apps/desktop/src-tauri/src/error.rs))
pour toutes les nouvelles commandes (pattern `map_err(AppError::Git)` déjà uniforme dans le
codebase).

---

## Frontend — nouveau store `stores/undoHistory.store.ts`

Store Zustand **non persisté** (pas de middleware `persist`, à la différence de
`repos.store.ts` qui persiste sélectivement via `partialize`). État :

```ts
interface Command {
  id: string
  label: string          // clé i18n + params, ex: "undoRedo.commit" / { sha }
  timestamp: number
  undo: () => Promise<void>
  redo: () => Promise<void>
}
interface UndoHistoryState {
  byRepo: Record<string, { stack: Command[]; pointer: number }>
  push: (repoPath: string, command: Command) => void
  undo: (repoPath: string) => Promise<void>
  redo: (repoPath: string) => Promise<void>
  clearRedo: (repoPath: string) => void
  canUndo: (repoPath: string) => boolean
  canRedo: (repoPath: string) => boolean
  peekUndoLabel: (repoPath: string) => string | null
  peekRedoLabel: (repoPath: string) => string | null
}
```

Logique : `push` tronque `stack` à `pointer`, ajoute la commande, cap à 50 (FIFO), `pointer =
stack.length`. `undo`/`redo` décrémentent/incrémentent le pointeur et appellent la closure
correspondante — **pas** de re-`clearRedo` sur undo/redo eux-mêmes (sinon on casserait le redo
juste après un undo).

---

## Câblage par action (`api/git.api.ts`)

Le fichier [git.api.ts](apps/desktop/src/api/git.api.ts) est déjà le point de passage unique
entre `tauri.ts` et l'UI (pattern `apiXxx` + `gameObserver.notify`) — on y ajoute la capture
d'état "avant" et le `push` dans le store undo, sans changer la signature publique des
fonctions `apiXxx` existantes.

- **`apiCreateCommit`** : lire l'OID HEAD courant avant l'appel (via `getBranches` déjà en
  cache côté appelant, passé en paramètre plutôt que requêté ici pour éviter un appel réseau
  supplémentaire) ; après le commit, pousser `{ undo: () => resetToCommit(path, previousOid, 'soft'), redo: () => resetToCommit(path, result.oid, 'soft') }`. Ne pousse rien si `previousOid` est `null` (premier commit).
- **`apiDiscardFileChanges`** : la commande retourne maintenant `DiscardResult` ; pousser
  `{ undo: () => restoreFileBlob(...) puis stageFile si wasStaged, redo: () => discardFileChanges(path, filePath) }`. Rien poussé si `snapshotBlobOid` est `null` (rien à restaurer, ex. fichier déjà vide de contenu récupérable).
- **Nouvelle `apiCheckoutBranch`** : capturer `fromRef` (nom de branche courant ou OID si
  `repo.isDetached`, déjà dans `repoCache`) ; si `force` et workdir sale, appeler
  `snapshotWorktree` avant. Pousser undo (checkout vers `fromRef`, restore snapshot si présent) / redo (checkout vers `toRef`).
- **Nouvelle `apiDeleteBranch`** : capturer `{ name, targetOid, upstream }` depuis la liste de
  branches déjà chargée avant suppression. Pousser undo (`checkout_branch`... non — recréer la
  ref, pas checkout : nouvelle petite commande ou réutiliser `create_branch`-like ; **note** :
  comme `create_branch` est hors scope/backend cassé, l'undo de `delete_branch` doit passer par
  un chemin qui ne dépend pas de `create_branch`. Ajouter directement la recréation dans
  `delete_branch`'s undo via un appel bas niveau équivalent (soit on implémente quand même un
  `create_branch` minimal viable comme effet de bord nécessaire à cet undo — à trancher en
  review, cf. section Points ouverts).
- **Nouvelle `apiRemoveRemote`** : capturer `{ name, url, pushUrl }` via `get_remotes` avant
  suppression. Pousser undo (`add_remote`) / redo (`remove_remote`).
- **`apiResetToCommit`** : capturer l'OID courant (paramètre fourni par l'appelant, déjà
  disponible dans `ResetDialog.tsx` puisqu'il affiche la liste des commits à annuler) ; si
  `mode === 'hard'` et workdir sale, snapshot avant. Pousser undo/redo symétriques.
- **Actions non-undoable qui invalident le redo** : `apiStashPush`, `apiStashPop`,
  `apiStashApply`, `apiStashDrop`, `apiRevertCommit`, `apiCreateFixupCommit`, `apiRunAutosquash`,
  et dans `ActionToolbar.tsx` les handlers `handleFetch`/`handleFetchAll`/`handlePull`/`handlePush`
  — chacun appelle `useUndoHistoryStore.getState().clearRedo(activeRepo)` après succès.

Mettre à jour les 5 points d'appel de `createCommit` (retour désormais un objet) :
[WorkingTreePanel.tsx:94](apps/desktop/src/components/.../WorkingTreePanel.tsx), les 2 dans
`WipStagingPanel.tsx` (lignes 149, 201), `CommitHeaderInfo.tsx:114` (amend — pas d'entrée undo
poussée pour un amend, hors scope de la liste des 6 actions), `GitGraph.tsx:309`.

---

## UI

### Toolbar (`ActionToolbar.tsx`)
Remplacer le bloc `disabled` lignes 202-213 par des boutons branchés sur
`useUndoHistoryStore` : `disabled={!activeRepo || !canUndo(activeRepo) || loading.undo}`,
`onClick={() => runAction('undo', () => undo(activeRepo!))}`, tooltip dynamique reprenant
`peekUndoLabel(activeRepo)` (ex. "Annuler : Commit a1b2c3d"). Ajouter `undo`/`redo` à
`LoadingKey`. `invalidateRepo()` après undo/redo (les query keys existantes couvrent branches,
git-log, git-status, stashes).

### Raccourcis clavier (`useKeyboardShortcuts.ts`)
Ajouter un bloc dédié (indépendant du `isMod` existant qui inclut `altKey`, pour éviter tout
conflit avec Alt+Z) : `const isCtrlOrCmd = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey`, puis si `isCtrlOrCmd && !e.altKey && e.key.toLowerCase() === 'z'` → `e.shiftKey ? onRedo() : onUndo()`. Le hook reçoit `onUndo`/`onRedo` en props (appelés depuis le composant racine avec `activeRepo` courant), même pattern que `onOpenSettings`.

### Menu contextuel "Delete branch" (`BranchItem.tsx` → `RepoView.tsx`)
Le callback `onContextMenu` existe déjà dans toute la chaîne mais n'est pas branché
([RepoView.tsx:40-49](apps/desktop/src/components/.../RepoView.tsx)). Créer
`showBranchNativeContextMenu` dans `nativeMenu.api.ts` (même pattern que
`showStashNativeContextMenu`, [nativeMenu.api.ts:152-197](apps/desktop/src/api/nativeMenu.api.ts#L152-L197))
avec une entrée "Supprimer la branche" → confirmation → `apiDeleteBranch`. Brancher
`onContextMenu` sur `RepoView.tsx` jusqu'à `RepositorySidebar`.

### Suppression de remote (`RemotesSection.tsx`)
Ajouter une icône poubelle sur l'en-tête de chaque `RemoteGroup`
([RemotesSection.tsx:22-39](apps/desktop/src/components/.../RemotesSection.tsx#L27-L39)),
confirmation, puis `apiRemoveRemote`. Nécessite de charger `get_remotes` (nouvelle query) plutôt
que de dériver les noms depuis `GitRepo.remotes` (qui ne contient que des URLs).

### i18n (`packages/i18n/locales/{en,fr}/git.json`)
Remplacer `toolbar.undoSoon`/`toolbar.redoSoon` par des tooltips dynamiques, ajouter des clés
par type de commande (`undoRedo.commit`, `undoRedo.discard`, `undoRedo.checkout`,
`undoRedo.deleteBranch`, `undoRedo.removeRemote`, `undoRedo.reset`) et des messages d'erreur
undo/redo, dans les deux locales.

---

## Points ouverts à trancher avant/pendant l'implémentation

1. **Undo de `delete_branch`** : nécessite de recréer une ref de branche. Le moyen le plus
   simple est d'implémenter quand même une commande backend minimale de création de ref (pas
   forcément le `create_branch` complet attendu par `BranchButton`, juste un utilitaire interne
   `undo.rs::recreate_branch_ref(path, name, oid)`), pour ne pas dépendre du `create_branch`
   actuellement cassé. C'est ce que ce plan implémente (pas de fix du bug préexistant
   `create_branch`/`rename_branch`, signalé séparément).
2. **Portée de l'historique** : par dépôt, non persisté — à confirmer, sinon ajuster le store.

## Vérification

- `cargo build` dans `apps/desktop/src-tauri` pour valider la compilation des nouvelles
  commandes et leur enregistrement dans `lib.rs`.
- Lancer l'app (`preview_start` / dev server Tauri), sur un dépôt de test :
  - Commit → Undo (fichiers repassent en staged) → Redo (commit revient, même OID affiché
    dans le graphe).
  - Discard d'un fichier modifié tracké → Undo (contenu restauré, statut staged/unstaged
    identique à avant) → Redo (redisparaît).
  - Discard d'un fichier untracked → Undo (fichier recréé) → Redo (supprimé à nouveau).
  - Checkout d'une branche → Undo (retour branche précédente) → Redo.
  - Delete branch → Undo (branche réapparaît au même OID) → Redo (disparaît).
  - Remove remote → Undo (remote réapparaît avec la même URL) → Redo.
  - Reset soft/mixed/hard → Undo → Redo, avec vérification spécifique du cas `hard` sur un
    workdir sale (les fichiers non committés doivent revenir).
  - Vérifier qu'un `fetch`/`pull`/`push`/`stash` après un `undo` désactive bien le bouton Redo.
  - Vérifier le plafond 50 : pousser 51 commandes undoable, confirmer que la plus ancienne
    disparaît de la pile.
  - Vérifier `git fsck` sur le dépôt de test après plusieurs discard/reset hard : les objets
    orphelins n'apparaissent dans aucune UI de l'app (log, branches, stash) — seulement en
    `dangling` via la commande git brute, confirmant l'absence de pollution visible.

---

# Phase 2 — Persistance de l'historique entre sessions

## Contexte

L'historique undo/redo (Phase 1) est actuellement en mémoire pure (`stores/undoHistory.store.ts`,
sans middleware `persist`) : il disparaît à la fermeture de l'app. L'utilisateur veut pouvoir
rouvrir l'app et retrouver la possibilité d'annuler/rétablir ses dernières actions.

Deux obstacles techniques bloquent une simple activation de `persist()` :
1. Les entrées actuelles (`UndoCommand`) portent des **closures JS** (`undo: () => Promise<void>`)
   — non sérialisables en JSON/localStorage.
2. Les objets Git de sauvegarde qu'on crée pour Discard / Reset hard / Checkout forcé / Stash
   pop-drop sont volontairement **orphelins** (aucune ref ne les protège), et ne survivent que
   grâce à la période de grâce du `git gc` local (~2 semaines par défaut). Correct pour un
   historique borné à la session ; pas sûr pour une persistance à durée indéterminée — un
   `git gc` (auto ou manuel) pourrait supprimer l'objet qu'une entrée persistée tente de
   restaurer, des semaines plus tard.

Décisions validées avec l'utilisateur :
- **Persistance locale uniquement**, aucune logique liée au remote. Un `push` ne modifie aucun
  objet/ref local, donc ne doit invalider aucune entrée — pas de changement nécessaire à ce
  niveau (le `pull` continue de simplement vider la queue redo via `clearRedoForActiveRepo`,
  comme en Phase 1, ce qui reste correct).
- **Invalidation par entrée, pas globale** : au lieu de vider tout l'historique dès qu'on
  détecte un changement externe, on vérifie individuellement quelles entrées restent exploitables
  et on ne jette que celles qui référencent un objet Git qui a disparu. Chaque entrée est
  autonome (elle stocke des OID absolus, pas des deltas relatifs à l'entrée précédente), donc
  la validité d'une entrée ne dépend pas de ses voisines dans la pile.

## Mécanisme de validation par entrée

Chaque type d'action référence 0 à plusieurs OID Git absolus (commit/blob/tree). Au démarrage
(ouverture d'un dépôt déjà connu du store persisté), on vérifie que ces objets existent encore
dans la base d'objets locale via une nouvelle commande légère `objects_exist` (`repo.odb()?.exists(oid)`,
pas besoin de charger l'objet entier). Toute entrée référençant un OID manquant est retirée de
la pile (et son `pointer` ajusté) ; le reste continue de fonctionner normalement.

## Rendre les objets de sauvegarde durables (pinning)

Comme l'historique peut maintenant survivre indéfiniment, les objets orphelins ne sont plus
protégés par la seule fenêtre de grâce du GC. Il faut les **épingler** via une ref cachée sous
un espace de noms dédié : `refs/git-manager/undo/<entryId>` (et `.../<entryId>/index` +
`.../<entryId>/workdir` pour les snapshots à deux trees). Ces refs sont invisibles dans les UI
git classiques (`git log`, branches, tags, stash — qui ne regardent que `refs/heads`,
`refs/tags`, `refs/remotes`, `refs/stash`), mais empêchent le GC de les nettoyer. Elles sont
supprimées par l'app elle-même quand l'entrée sort de l'historique (éviction au plafond 50,
troncature de la queue redo, ou invalidation par la vérification ci-dessus).

## Backend Rust — `commands/undo.rs`

- **`pin_object(path, ref_name, oid) -> Result<(), String>`** : crée/écrase une ref directe
  `refs/git-manager/undo/<ref_name>` pointant sur `oid` (`repo.reference(&full_name, oid, true, "git-manager: pin")`).
  Fonctionne pour un OID de blob, tree ou commit indifféremment.
- **`unpin_object(path, ref_name) -> Result<(), String>`** : supprime cette ref si elle existe
  (idempotent — pas d'erreur si déjà absente).
- **`objects_exist(path, oids: Vec<String>) -> Result<Vec<bool>, String>`** : vérifie l'existence
  de chaque OID via `repo.odb()?.exists(...)`, en un seul aller-retour IPC (appelé une fois par
  dépôt à l'ouverture, potentiellement jusqu'à ~100 OID pour un historique plein).
- **`snapshot_file`, `snapshot_worktree`, `snapshot_worktree_always`** (existants) : ajouter un
  paramètre `entry_id: String` et épingler automatiquement l'objet/les trees créés avant de
  retourner (évite un aller-retour IPC séparé et une fenêtre de race entre création et pinning).
  Les retours (`DiscardResult`-like, `WorktreeSnapshot`) gagnent les noms de ref créés
  (`ref_name`, ou `index_ref_name`/`workdir_ref_name`) pour que le frontend sache quoi nettoyer
  à l'éviction.
- Pour le stash pop/drop, le commit du stash existe déjà (retourné par `stash_list`) : le
  frontend appelle `pin_object` directement dessus avant `stash_pop`/`stash_drop`.

## Frontend — remplacer les closures par des actions sérialisables

### `stores/undoHistory.store.ts`
- `UndoCommand { undo: () => Promise<void>; redo: () => Promise<void> }` devient `UndoAction`,
  une union discriminée par `type` (`commit`, `discard`, `checkout`, `deleteBranch`,
  `removeRemote`, `reset`, `stashPush`, `stashPop`, `stashApply`, `stashDrop`), portant
  uniquement des données JSON-sérialisables (OID, noms, flags, `pinnedRefs?: string[]`).
- Ajouter le middleware `persist()` (import `from 'zustand/middleware'`), même pattern que
  [repos.store.ts:53-208](apps/desktop/src/stores/repos.store.ts#L53-L208) — stockage
  `byRepo` uniquement (déjà 100% sérialisable, pas besoin de `partialize`).
- `undo(repoPath)`/`redo(repoPath)` appellent désormais `executeUndo(action)`/`executeRedo(action)`
  (nouveau module, voir ci-dessous) au lieu de `action.undo()`/`action.redo()`.
- Toute éviction d'entrée (plafond 50 dans `push`, troncature de la queue redo, nouvelle méthode
  `validateAndPrune`) déclenche `unpinObject` pour chaque ref listée dans `pinnedRefs` de
  l'entrée évincée (best-effort, erreurs ignorées).
- Nouvelle méthode `validateAndPrune(repoPath): Promise<void>` : rassemble tous les OID
  référencés par la pile du dépôt, appelle `objectsExist`, retire les entrées invalides et
  ajuste `pointer`.

### Nouveau module `lib/undoActions.ts`
Dispatcher pur `executeUndo(action: UndoAction)` / `executeRedo(action: UndoAction)` — un
`switch` sur `action.type` qui reproduit exactement la logique actuellement inline dans les
closures de `api/git.api.ts` (reprise mécanique, même séquence d'appels `tauri.ts`).

### `api/git.api.ts`
Chaque `apiXxx` (créateur d'entrée undo) génère l'`id` de l'entrée **avant** d'appeler les
commandes de snapshot (pour transmettre `entry_id` et récupérer les noms de ref créés), construit
un objet `UndoAction` (au lieu d'un objet à closures) et le pousse via `store.push()`. Même
séquence de capture qu'en Phase 1, juste le format de sortie qui change.

### Déclenchement de la validation au démarrage
Dans [RepoView.tsx](apps/desktop/src/app/repo/RepoView.tsx), dans le `useEffect` existant qui
appelle déjà `openRepo` une fois par dépôt (`if (activeRepo && !repoCache[activeRepo])`),
ajouter l'appel à `useUndoHistoryStore.getState().validateAndPrune(activeRepo)` une fois le
dépôt confirmé ouvert.

## Limite connue (acceptée, pas de correction prévue)

L'undo de `stashPush` suppose que la stash créée est toujours `stash@{0}` au moment de l'undo
(hypothèse déjà présente en Phase 1). Avec la persistance, la fenêtre de temps pendant laquelle
cette hypothèse pourrait être invalidée par une manipulation externe (terminal) s'allonge. Comme
demandé, on ne complexifie pas davantage pour ce cas précis — reste couvert par la même logique
qu'en Phase 1 (queue redo/undo strictement LIFO, aucune garantie si l'utilisateur manipule les
stash en dehors de l'app entre-temps).

## Vérification

- `cargo build` pour les nouvelles commandes (`pin_object`, `unpin_object`, `objects_exist`) et
  les signatures modifiées (`entry_id` sur les commandes de snapshot).
- Undo/redo d'un Commit, fermer l'app, la rouvrir, refaire un Undo → doit fonctionner (objet
  retrouvé via son OID, toujours valide car un commit normal reste toujours atteignable).
- Discard d'un fichier, fermer l'app, la rouvrir, `git gc --prune=now` manuellement dans un
  terminal **avant** de cliquer Undo → le blob orphelin est protégé par sa ref cachée, donc
  toujours présent malgré le gc ; Undo doit réussir.
- Simuler une entrée invalide : capturer un OID, le altérer manuellement dans le localStorage
  persisté, rouvrir l'app → l'entrée doit disparaître silencieusement de la pile (vérifiable via
  le bouton Undo qui saute cette entrée), sans crasher les autres entrées valides.
- Vérifier qu'après éviction (plafond 50 ou troncature redo), les refs `refs/git-manager/undo/*`
  correspondantes disparaissent (`git for-each-ref refs/git-manager/undo` doit refléter
  uniquement les entrées encore présentes dans l'historique).
