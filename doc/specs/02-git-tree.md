# Spec 02 — Git Tree (Visualisation graphe)

## Objectif

Afficher l'historique Git sous forme de graphe interactif, avec branches, tags et détail de commit accessible en un clic.

---

## Vue générale

La vue Git Tree est la vue principale d'un repo. Elle se compose de :

```
┌──────────────────────────────────────────────────────────────┐
│  [Barre d'outils : filtre, refresh, options]                 │
├───────────────────────────────┬──────────────────────────────┤
│                               │                              │
│    Graphe git                 │   Panneau détail commit      │
│    (colonne gauche)           │   (colonne droite)           │
│                               │                              │
│  ●─────── feat/login ──────── │  Commit abc1234              │
│  │  ●──── fix/typo ─────────  │  Author: Antoine             │
│  │  │                        │  Date: 2026-06-20             │
│  ●──┘  Merge fix/typo        │                              │
│  │                           │  feat: add login page         │
│  ●     chore: update deps     │                              │
│  │                           │  ─────────────────────────── │
│  ●     initial commit         │  Diff                        │
│                               │  + src/pages/Login.tsx       │
└───────────────────────────────┴──────────────────────────────┘
```

---

## Graphe git

### Rendu

- Chaque commit est un **nœud** (cercle coloré)
- Les **lignes** relient les commits parents/enfants
- Les **branches** et **tags** sont des labels colorés sur le nœud correspondant
- La **branche HEAD** est en surbrillance

### Algorithme de layout

Le graphe est calculé côté Rust (`git/graph.rs`) et retourné avec des coordonnées de colonnes :

```typescript
export interface GraphNode {
  commit: GitCommit
  column: number          // colonne X dans la grille
  connections: GraphEdge[]
  refs: GitRef[]
}

export interface GraphEdge {
  fromColumn: number
  toColumn: number
  color: string
}

export interface GitRef {
  name: string
  type: 'branch' | 'tag' | 'remote' | 'HEAD'
  color: string
}
```

### Couleurs

Chaque branche se voit assigner une couleur stable (hash du nom → palette). Les couleurs sont cohérentes entre les sessions.

### Virtualisation

L'historique peut contenir des milliers de commits. Le graphe utilise une liste virtualisée (`@tanstack/react-virtual`) pour n'afficher que les lignes visibles.

---

## Panneau détail commit

Déclenché par un clic sur un nœud du graphe.

### Contenu

- SHA-1 complet + bouton copie
- Branches / tags associés
- Auteur (avatar gravatar optionnel) + email + date relative
- Message complet (subject + body si présent)
- Statistiques : N fichiers modifiés, +X -Y lignes
- Diff par fichier (expandable, syntax highlighting)

### Diff

- Rendu unified diff avec coloration syntaxique (`shiki` ou `prism`)
- Bouton "Voir fichier complet" (aperçu du fichier à ce commit)
- Indicateur de type de changement : Added / Modified / Deleted / Renamed

### Actions sur un commit

Depuis le panneau détail :
- **Checkout** ce commit (mode detached HEAD)
- **Créer une branche** depuis ce commit
- **Revert** ce commit
- **Reset** jusqu'à ce commit (soft / mixed / hard)
- **Copier le SHA**
- **Fixup** (committer un fixup depuis les changes actuels vers ce commit)
- **Cherry-pick** (futur)

---

## Filtres et recherche

- **Branche** : dropdown de toutes les branches (locale + remote)
- **Auteur** : texte libre
- **Date** : plage de dates
- **Message** : recherche texte dans les messages
- **Fichier** : afficher seulement les commits touchant un fichier donné

---

## Zoom et navigation

- Scroll vertical : défilement de l'historique
- **Ctrl+F** : focus sur la barre de recherche
- **Ctrl+Home** : retour au commit HEAD
- Clic sur un label de branche : filtre rapide sur cette branche

---

## Commandes Tauri impliquées

| Command | Paramètres | Retour |
|---------|-----------|--------|
| `get_log` | `path, limit, skip, branch?, author?, since?, until?` | `GraphNode[]` |
| `get_commit_diff` | `path, oid` | `GitDiff` |
| `get_commit_file` | `path, oid, file_path` | `string` (contenu) |
| `get_refs` | `path` | `GitRef[]` |

---

## Composants React

```
components/git-graph/
├── GitGraph.tsx           # Conteneur principal + virtualisation
├── GraphRow.tsx           # Une ligne = un commit
├── GraphCanvas.tsx        # Dessin SVG des lignes de connexion
├── RefLabel.tsx           # Label branche/tag/remote
├── CommitPanel.tsx        # Panneau détail (colonne droite)
├── DiffViewer.tsx         # Affichage du diff
└── CommitActions.tsx      # Menu d'actions sur un commit
```

---

## i18n keys

```json
{
  "gitTree.noCommits": "Aucun commit",
  "gitTree.loading": "Chargement de l'historique...",
  "gitTree.filterBranch": "Filtrer par branche",
  "gitTree.filterAuthor": "Filtrer par auteur",
  "gitTree.detailPanel.sha": "SHA",
  "gitTree.detailPanel.copy": "Copier",
  "gitTree.detailPanel.filesChanged": "{{count}} fichier(s) modifié(s)",
  "gitTree.actions.checkout": "Checkout",
  "gitTree.actions.createBranch": "Créer une branche ici",
  "gitTree.actions.revert": "Revert",
  "gitTree.actions.reset": "Reset..."
}
```
