# Spec 08 — Stash management

## Objectif

Permettre de gérer les stashes Git (mise de côté temporaire des modifications) depuis une interface visuelle avec prévisualisation du diff.

---

## Vue Stash

Accessible via la sidebar du repo → section "Stashes" ou via le menu Actions.

```
┌──────────────────────────────────────────────────────────┐
│  Stashes — myapp                              [+ Stash]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  stash@{0}  WIP: login form refactor          2h ago    │
│             3 fichiers · +42 -15              [▾ Actions]│
│                                                          │
│  stash@{1}  On main: quick fix attempt        1j ago    │
│             1 fichier · +3 -1                 [▾ Actions]│
│                                                          │
│  stash@{2}  (sans message)                    3j ago    │
│             5 fichiers · +128 -34             [▾ Actions]│
│                                                          │
│                                           [Purger tout]  │
└──────────────────────────────────────────────────────────┘
```

---

## Fonctionnalités

### Créer un stash (`stash push`)

```
Bouton "+ Stash" (ou Cmd+Shift+S) →

┌──────────────────────────────────────────────────────────┐
│  Mettre de côté les modifications                        │
│                                                          │
│  Message :  [WIP: refactoring auth             ]         │
│             (optionnel)                                  │
│                                                          │
│  Options :                                               │
│  ☑ Inclure les fichiers non-suivis (--include-untracked) │
│  ☐ Stash partiel (sélectionner les fichiers)             │
│                                                          │
│  Fichiers concernés : 3                                  │
│  • src/auth/login.ts (modified)                          │
│  • src/auth/logout.ts (modified)                         │
│  • src/components/LoginForm.tsx (new)                    │
│                                                          │
│  [Annuler]                      [Stash]                  │
└──────────────────────────────────────────────────────────┘
```

### Stash partiel

Si "stash partiel" est coché, l'utilisateur peut sélectionner fichier par fichier (ou hunk par hunk) ce qui sera stasher.

### Appliquer un stash (`stash pop` / `stash apply`)

Menu Actions d'un stash :
- **Pop** — Applique le stash ET le supprime de la liste
- **Apply** — Applique sans supprimer (permet de l'appliquer sur plusieurs branches)
- **Brancher depuis** — Crée une nouvelle branche et applique le stash dessus

### Supprimer un stash (`stash drop`)

- Confirmation simple (le stash sera perdu)
- Pas de récupération possible

### Purger tout (`stash clear`)

- Double confirmation
- "Cette action supprimera **tous** les stashes définitivement."

### Prévisualiser un stash

Clic sur un stash → panneau latéral avec :
- Liste des fichiers modifiés avec statuts (A/M/D)
- Diff complet par fichier (expandable)
- Branche sur laquelle le stash a été créé
- Commit HEAD au moment du stash

---

## Gestion des conflits à l'application

Si un `stash pop` ou `apply` génère des conflits :
1. Opération interrompue, statut `CONFLICT`
2. Fichiers en conflit listés
3. Options : **Résoudre** (ouvre l'outil de merge) / **Annuler l'apply** (`git checkout .`)

---

## Commandes Tauri impliquées

| Command | Paramètres | Description |
|---------|-----------|-------------|
| `stash_push` | `path, message?, include_untracked?, paths?` | Crée un stash |
| `stash_list` | `path` | Retourne la liste des stashes |
| `stash_show` | `path, index` | Retourne le diff d'un stash |
| `stash_pop` | `path, index?` | Applique et supprime |
| `stash_apply` | `path, index?` | Applique sans supprimer |
| `stash_drop` | `path, index` | Supprime un stash |
| `stash_clear` | `path` | Supprime tous les stashes |
| `stash_branch` | `path, index, branch_name` | Crée une branche depuis un stash |

---

## Types TypeScript

```typescript
export interface GitStash {
  index: number           // 0 = stash@{0}
  message: string
  branch: string          // branche au moment du stash
  commitOid: string       // commit HEAD au moment du stash
  timestamp: number
  filesCount: number
  additions: number
  deletions: number
}
```

---

## Composants React

```
components/stash/
├── StashList.tsx           # Liste des stashes
├── StashItem.tsx           # Une entrée avec actions
├── StashPushDialog.tsx     # Dialog création stash
├── StashPreviewPanel.tsx   # Panneau diff du stash
└── StashConflictBanner.tsx # Bannière si conflit à l'apply
```

---

## i18n keys

```json
{
  "stash.title": "Stashes",
  "stash.push": "Mettre de côté",
  "stash.pop": "Pop (appliquer et supprimer)",
  "stash.apply": "Appliquer",
  "stash.drop": "Supprimer",
  "stash.clear": "Purger tout",
  "stash.branch": "Créer une branche depuis ce stash",
  "stash.noMessage": "(sans message)",
  "stash.pushDialog.title": "Mettre de côté les modifications",
  "stash.pushDialog.message": "Message (optionnel)",
  "stash.pushDialog.includeUntracked": "Inclure les fichiers non-suivis",
  "stash.pushDialog.partial": "Stash partiel",
  "stash.clearConfirm": "Supprimer définitivement TOUS les stashes ?",
  "stash.conflict": "Conflits lors de l'application du stash.",
  "stash.files": "{{count}} fichier(s)"
}
```
