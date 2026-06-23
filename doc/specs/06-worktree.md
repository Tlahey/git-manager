# Spec 06 — Worktree management

## Objectif

Permettre de créer, lister, switcher et supprimer des worktrees Git depuis une interface visuelle. Un worktree permet d'avoir plusieurs branches checkoutées simultanément dans des dossiers séparés.

---

## Concept Git Worktree

```bash
# Repo principal
/Projects/myapp/          → branche: main

# Worktrees additionnels
/Projects/myapp-feat/     → branche: feat/new-feature
/Projects/myapp-hotfix/   → branche: hotfix/critical-fix
```

Chaque worktree partage le même `.git/` (via `.git/worktrees/`), mais a son propre répertoire de travail et sa propre branche.

---

## Vue Worktrees

Accessible depuis la sidebar du repo → onglet "Worktrees" ou via le menu.

```
┌──────────────────────────────────────────────────────────┐
│  Worktrees — myapp                                       │
│                                            [+ Nouveau]   │
├──────────────────────────────────────────────────────────┤
│  ● main (principal)                                      │
│    /Projects/myapp                                       │
│    Dernier commit : abc1234 — 2h ago                    │
│                                                          │
│  ○ feat/new-feature                                      │
│    /Projects/myapp-feat                                  │
│    Dernier commit : bcd2345 — 1j ago        [Ouvrir]   │
│                                                          │
│  ○ hotfix/critical-fix                                   │
│    /Projects/myapp-hotfix                                │
│    Dernier commit : cde3456 — 10min ago     [Ouvrir]   │
│                                             [Supprimer]  │
└──────────────────────────────────────────────────────────┘
```

---

## Fonctionnalités

### Créer un worktree

```
Clic "+ Nouveau" →

┌──────────────────────────────────────────────────────────┐
│  Nouveau worktree                                        │
│                                                          │
│  Branche :  [feat/my-feature         ▾]                 │
│             ○ Branche existante                          │
│             ● Nouvelle branche                           │
│                                                          │
│  Nouveau nom :  [feat/my-feature                ]        │
│  Depuis :       [main                          ▾]        │
│                                                          │
│  Chemin :  [/Projects/myapp-my-feature          ] [...]  │
│            (suggestion automatique)                      │
│                                                          │
│  [Annuler]                         [Créer le worktree]   │
└──────────────────────────────────────────────────────────┘
```

- Le chemin est suggéré automatiquement : `<parent_dir>/<repo>-<branch_name>`
- La branche ne peut pas être déjà checkoutée dans un autre worktree

### Ouvrir un worktree

Clic "Ouvrir" → ouvre le worktree en tant que **nouvel onglet** dans l'application avec son propre contexte Git.

Le worktree apparaît dans la sidebar du dashboard avec une icône distincte (🔀) indiquant que c'est un worktree lié.

### Supprimer un worktree

```
1. Clic "Supprimer"
2. Dialog de confirmation :
   - Si worktree propre : confirmation simple
   - Si worktree dirty : avertissement + confirmation renforcée
3. Option : "Supprimer aussi la branche associée"
4. Exécution → dossier supprimé + worktree retiré du registre .git
```

### Synchroniser les worktrees

Bouton "Synchroniser" dans la liste → effectue un `fetch` sur tous les worktrees d'un coup et met à jour les statuts.

---

## Statuts possibles

| Statut | Icône | Description |
|--------|-------|-------------|
| Propre | ✓ vert | Pas de modifications |
| Dirty | • orange | Modifications non commitées |
| Ahead | ↑ bleu | Commits non poussés |
| Behind | ↓ gris | Commits à récupérer |
| Locked | 🔒 | Worktree verrouillé manuellement |
| Prunable | ⚠️ | Dossier supprimé, worktree orphelin |

---

## Détection des worktrees orphelins

Au démarrage ou lors d'un refresh, l'app détecte les worktrees dont le dossier n'existe plus et propose de les purger (`git worktree prune`).

---

## Commandes Tauri impliquées

| Command | Paramètres | Description |
|---------|-----------|-------------|
| `list_worktrees` | `path` | Retourne tous les worktrees du repo |
| `add_worktree` | `path, branch, worktree_path, new_branch?, from?` | Crée un worktree |
| `remove_worktree` | `path, worktree_path, force?` | Supprime un worktree |
| `lock_worktree` | `path, worktree_path, reason?` | Verrouille |
| `prune_worktrees` | `path` | Supprime les entrées orphelines |

---

## Types TypeScript

```typescript
export interface GitWorktree {
  path: string
  branch: string
  commitOid: string
  isMain: boolean
  isLocked: boolean
  isDirty: boolean
  isPrunable: boolean
  lockedReason?: string
}
```

---

## Composants React

```
components/worktree/
├── WorktreeList.tsx          # Liste complète
├── WorktreeItem.tsx          # Une ligne de worktree
├── AddWorktreeDialog.tsx     # Dialog création
├── RemoveWorktreeDialog.tsx  # Dialog suppression avec options
└── WorktreeBadge.tsx         # Badge dans la sidebar (indicateur lié)
```

---

## i18n keys

```json
{
  "worktree.title": "Worktrees",
  "worktree.add": "Nouveau worktree",
  "worktree.open": "Ouvrir",
  "worktree.remove": "Supprimer",
  "worktree.main": "Principal",
  "worktree.locked": "Verrouillé",
  "worktree.prunable": "Dossier introuvable",
  "worktree.addDialog.title": "Nouveau worktree",
  "worktree.addDialog.branch": "Branche",
  "worktree.addDialog.newBranch": "Nouvelle branche",
  "worktree.addDialog.path": "Chemin du dossier",
  "worktree.removeDialog.dirty": "Ce worktree a des modifications non commitées.",
  "worktree.removeDialog.deleteBranch": "Supprimer aussi la branche {{branch}}",
  "worktree.orphansFound": "{{count}} worktree(s) orphelin(s) trouvé(s). Purger ?"
}
```
