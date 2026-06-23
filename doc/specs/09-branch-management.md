# Spec 09 — Branch management

## Objectif

Gérer toutes les opérations sur les branches Git (création, suppression, renommage, checkout, merge, comparaison) depuis une interface unifiée.

---

## Vue Branches

Accessible via la sidebar du repo → section "Branches" (arborescente par préfixe).

```
┌──────────────────────────────────────────────────────────┐
│  Branches                                    [+ Créer]   │
├──────────────────────────────────────────────────────────┤
│  LOCAL                                                   │
│  ● main                      HEAD · 2h ago              │
│  ▶ feat/                                                 │
│      feat/login-page         ↑2 ↓0 · 1j ago  [···]     │
│      feat/api-refactor       ↑0 ↓3 · 3j ago  [···]     │
│  ▶ fix/                                                  │
│      fix/typo                ↑1 ↓0 · 10min   [···]     │
│                                                          │
│  REMOTE (origin)                                         │
│  ▶ origin/main               sync                       │
│  ▶ origin/feat/login-page    ↑0 ↓0                     │
└──────────────────────────────────────────────────────────┘
```

- **●** indique la branche HEAD
- **↑N ↓M** = ahead/behind du remote tracking
- **[···]** = menu contextuel

---

## Fonctionnalités

### Créer une branche

```
┌──────────────────────────────────────────────────────────┐
│  Nouvelle branche                                        │
│                                                          │
│  Nom :     [feat/my-feature                    ]         │
│  Depuis :  [main                               ▾]        │
│                                                          │
│  ☑ Checkout automatiquement après création               │
│                                                          │
│  [Annuler]                          [Créer]              │
└──────────────────────────────────────────────────────────┘
```

- Validation du nom (caractères interdits, conflits)
- Suggestion de préfixe selon le nom (feat/, fix/, chore/…)

### Checkout

- Double-clic sur une branche → checkout
- Si working tree dirty : proposer stash auto + checkout, ou forcer avec `--force`
- Checkout d'une branche remote → crée automatiquement le tracking local

### Renommer une branche

- Inline edit (clic sur le nom → éditable)
- Met à jour le remote si la branche était poussée (avec confirmation)

### Supprimer une branche

```
Confirmation :
- Branche non pushée : "Cette branche n'a pas été poussée. Les commits seront perdus."
- Branche mergée : confirmation simple
- Remote : "Supprimer aussi origin/{{branch}} ?" (checkbox)
```

Interdit de supprimer la branche HEAD.

### Merge

```
Depuis la branche cible (ex: main) → clic droit sur branche source → "Merge ici"

┌──────────────────────────────────────────────────────────┐
│  Merger feat/login-page → main                           │
│                                                          │
│  5 commits à intégrer                                    │
│  Stratégie :                                             │
│  ● Merge (crée un commit de merge)                       │
│  ○ Fast-forward si possible                              │
│  ○ Squash merge (tous les commits en un)                 │
│                                                          │
│  [Annuler]                          [Merger]             │
└──────────────────────────────────────────────────────────┘
```

### Comparer deux branches

```
Clic droit sur branche → "Comparer avec..."

Vue diff entre les deux branches :
- Commits dans A mais pas B (et vice-versa)
- Diff cumulé des fichiers
```

---

## Commandes Tauri impliquées

| Command | Paramètres | Description |
|---------|-----------|-------------|
| `get_branches` | `path, include_remote?` | Liste complète |
| `create_branch` | `path, name, from_ref` | Crée une branche |
| `checkout_branch` | `path, name, force?` | Checkout |
| `rename_branch` | `path, old_name, new_name` | Renomme |
| `delete_branch` | `path, name, force?, delete_remote?` | Supprime |
| `merge_branch` | `path, source, strategy` | Merge |
| `compare_branches` | `path, base, compare` | Commits et diff entre branches |
| `get_ahead_behind` | `path, branch` | Sync status vs remote |

---

## Types TypeScript

```typescript
export interface GitBranch {
  name: string
  shortName: string
  isHead: boolean
  isRemote: boolean
  upstream?: string
  commitOid: string
  commitMessage: string
  commitTimestamp: number
  aheadCount: number
  behindCount: number
}

export type MergeStrategy = 'merge' | 'fast-forward' | 'squash'
```

---

## Composants React

```
components/branch/
├── BranchList.tsx              # Liste arborescente
├── BranchItem.tsx              # Une branche avec indicateurs
├── CreateBranchDialog.tsx      # Dialog création
├── DeleteBranchDialog.tsx      # Dialog suppression
├── MergeBranchDialog.tsx       # Dialog merge avec stratégie
└── CompareBranchesView.tsx     # Vue comparaison
```

---

## i18n keys

```json
{
  "branch.title": "Branches",
  "branch.create": "Créer une branche",
  "branch.checkout": "Checkout",
  "branch.rename": "Renommer",
  "branch.delete": "Supprimer",
  "branch.merge": "Merger ici",
  "branch.compare": "Comparer avec...",
  "branch.createDialog.name": "Nom de la branche",
  "branch.createDialog.from": "Depuis",
  "branch.createDialog.autoCheckout": "Checkout automatique",
  "branch.deleteDialog.notPushed": "Cette branche n'a pas été poussée. Les commits seront perdus.",
  "branch.deleteDialog.deleteRemote": "Supprimer aussi {{remote}}/{{branch}}",
  "branch.mergeDialog.title": "Merger {{source}} → {{target}}",
  "branch.mergeDialog.strategy.merge": "Merge",
  "branch.mergeDialog.strategy.ff": "Fast-forward",
  "branch.mergeDialog.strategy.squash": "Squash merge",
  "branch.aheadBehind": "↑{{ahead}} ↓{{behind}}"
}
```
