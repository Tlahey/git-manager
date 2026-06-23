# Spec 07 — Rebase interactif

## Objectif

Permettre d'effectuer un `git rebase -i` depuis une interface drag & drop, sans passer par un éditeur texte. L'utilisateur peut réorganiser, fusionner, supprimer et réécrire des commits de manière visuelle.

---

## Actions rebase disponibles

| Action | Raccourci | Description |
|--------|-----------|-------------|
| `pick` | p | Garder le commit tel quel |
| `reword` | r | Garder le commit, éditer le message |
| `edit` | e | Pause à ce commit pour amender |
| `squash` | s | Fusionner avec le commit précédent, combiner les messages |
| `fixup` | f | Fusionner avec le commit précédent, ignorer le message |
| `drop` | d | Supprimer ce commit |

---

## Flux utilisateur

### Lancer un rebase interactif

```
1. Clic droit sur un commit dans le git tree → "Rebase interactif depuis ici..."
   OU menu branche → "Rebase interactif..."

2. Sélection de la base :
   - Par défaut : commit sélectionné (tous les commits depuis lui)
   - Alternative : "N derniers commits" (input numérique)

3. Ouverture du panneau Rebase interactif
```

### Interface de rebase

```
┌──────────────────────────────────────────────────────────────┐
│  Rebase interactif — 4 commits                              │
│                                     [Annuler]  [Exécuter]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⠿  [pick  ▾]  abc1234  feat: add login page               │
│  ⠿  [squash▾]  bcd2345  fix: typo in login                  │
│  ⠿  [pick  ▾]  cde3456  chore: update deps                  │
│  ⠿  [drop  ▾]  def4567  WIP: temp                          │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  Aperçu du résultat :                                        │
│  ● abc1234' feat: add login page (+ fix: typo in login)     │
│  ● cde3456  chore: update deps                              │
│  (def4567 sera supprimé)                                     │
└──────────────────────────────────────────────────────────────┘
```

- **Drag & drop** (icône ⠿) pour réordonner les commits
- **Dropdown** par commit pour changer l'action
- **Prévisualisation en temps réel** du résultat final
- Les commits `squash`/`fixup` sont visuellement "rattachés" à leur parent

### Reword inline

Quand l'action est `reword`, un champ texte apparaît directement dans la liste :

```
⠿  [reword▾]  abc1234  [feat: add login page          ]
```

### Exécution

```
1. Clic "Exécuter"
2. Confirmation si des commits publiés sont inclus :
   "⚠️ Ces commits ont déjà été poussés. Continuer ?"

3. Exécution en arrière-plan avec progression :
   ┌─────────────────────────────────┐
   │  Rebase en cours...             │
   │  Commit 2/4 : cde3456           │
   │  [████████░░] 50%               │
   │                      [Aborter]  │
   └─────────────────────────────────┘

4. Si conflit → pause :
   ┌─────────────────────────────────────────────────────┐
   │  ⚠️ Conflit sur bcd2345 "fix: typo in login"        │
   │                                                     │
   │  Fichiers en conflit :                              │
   │  • src/pages/Login.tsx                              │
   │                                                     │
   │  Résolvez les conflits, puis :                      │
   │  [Aborter]    [Skip ce commit]    [Continuer]       │
   └─────────────────────────────────────────────────────┘

5. Succès → graphe mis à jour, notification
```

---

## Gestion de l'état mid-rebase

Si l'application est fermée pendant un rebase en cours :
- Au prochain lancement, détection de l'état `REBASE_HEAD`
- Banner "Un rebase est en cours" avec actions Continue / Abort
- Les options restantes sont affichées telles quelles

---

## Raccourcis clavier dans le panneau

| Raccourci | Action |
|-----------|--------|
| `P` | Action pick |
| `S` | Action squash |
| `F` | Action fixup |
| `R` | Action reword |
| `D` | Action drop |
| `↑↓` | Déplacer le commit sélectionné |
| `Cmd+Enter` | Exécuter |
| `Esc` | Annuler |

---

## Commandes Tauri impliquées

| Command | Paramètres | Description |
|---------|-----------|-------------|
| `get_rebase_commits` | `path, base_oid` | Retourne la liste des commits éditables |
| `start_interactive_rebase` | `path, base_oid, steps: RebaseStep[]` | Lance le rebase |
| `continue_rebase` | `path` | Continue après résolution de conflit |
| `abort_rebase` | `path` | Abandonne le rebase en cours |
| `skip_rebase_commit` | `path` | Skip le commit actuel |
| `get_rebase_state` | `path` | État actuel (si rebase en cours) |

```typescript
export interface RebaseStep {
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'
  oid: string
  message: string   // nouveau message pour reword
}
```

---

## Composants React

```
components/rebase/
├── RebasePanel.tsx            # Panneau principal
├── RebaseStepList.tsx         # Liste drag & drop des commits
├── RebaseStepRow.tsx          # Une ligne (action + commit)
├── RebasePreview.tsx          # Aperçu du résultat
├── RebaseProgress.tsx         # Barre de progression pendant exécution
├── RebaseConflictBanner.tsx   # Pause sur conflit
└── RebaseInProgressBanner.tsx # Détection rebase existant
```

---

## i18n keys

```json
{
  "rebase.title": "Rebase interactif — {{count}} commits",
  "rebase.execute": "Exécuter",
  "rebase.cancel": "Annuler",
  "rebase.abort": "Aborter",
  "rebase.continue": "Continuer",
  "rebase.skip": "Skip ce commit",
  "rebase.actions.pick": "pick",
  "rebase.actions.reword": "reword",
  "rebase.actions.squash": "squash",
  "rebase.actions.fixup": "fixup",
  "rebase.actions.drop": "drop",
  "rebase.preview.title": "Aperçu du résultat",
  "rebase.inProgress": "Un rebase est en cours.",
  "rebase.conflict": "Conflit sur \"{{message}}\"",
  "rebase.conflictFiles": "Fichiers en conflit : {{count}}"
}
```
