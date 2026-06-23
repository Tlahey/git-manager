# Spec 04 — Rollback

## Objectif

Permettre d'annuler des commits ou des modifications de manière sûre, avec une prévisualisation claire des conséquences avant toute action destructive.

---

## Modes de rollback

### 1. `git revert` — Annulation non-destructive

Crée un nouveau commit qui annule les changements d'un commit existant. **Sûr sur les branches partagées.**

```
Avant : A → B → C (HEAD)
Après : A → B → C → C' (revert de C)
```

**Quand l'utiliser** : branche partagée avec d'autres, quand on veut garder l'historique intact.

### 2. `git reset --soft` — Réinitialisation douce

Déplace HEAD sans toucher au staging ni aux fichiers.

```
Avant : A → B → C (HEAD)  [rien de staged]
Après : A → B (HEAD)      [C est "unstagé", fichiers intacts]
```

**Quand l'utiliser** : reformuler un ou plusieurs commits récents, re-splitter.

### 3. `git reset --mixed` (défaut)

Déplace HEAD et vide le staging, fichiers intacts.

```
Après : A → B (HEAD)  [changements de C dans working tree]
```

### 4. `git reset --hard` — Réinitialisation complète ⚠️

Déplace HEAD, vide staging **et efface les modifications des fichiers**.

```
Après : A → B (HEAD)  [changements de C définitivement perdus]
```

**Requiert une confirmation explicite.**

---

## Flux utilisateur

### Revert d'un commit

```
1. Clic droit sur un commit dans le git tree → "Revert ce commit"
   OU action depuis le panneau détail

2. Dialog de prévisualisation :
   ┌─────────────────────────────────────────────────────┐
   │  Revert "feat: add login page" (abc1234)             │
   │                                                     │
   │  Cela va créer un nouveau commit :                  │
   │  "Revert 'feat: add login page'"                    │
   │                                                     │
   │  Fichiers affectés : 3                              │
   │  [voir le diff du revert]                           │
   │                                                     │
   │  [Annuler]          [Confirmer le revert]           │
   └─────────────────────────────────────────────────────┘

3. Exécution → nouveau commit visible dans le graphe
4. Notification : "Revert créé : def5678"
```

### Reset jusqu'à un commit

```
1. Clic droit sur un commit → "Reset jusqu'ici..."
   OU depuis le panneau détail

2. Sélection du mode :
   ┌─────────────────────────────────────────────────────┐
   │  Reset jusqu'à "chore: update deps" (bcd2345)       │
   │                                                     │
   │  Commits qui seront défaits : 2                     │
   │  • abc1234 feat: add login page                     │
   │  • xyz9876 fix: typo                                │
   │                                                     │
   │  Mode :                                             │
   │  ○ Soft   — garder les changements (staged)         │
   │  ● Mixed  — garder les changements (unstaged)       │
   │  ○ Hard   — SUPPRIMER les changements ⚠️            │
   │                                                     │
   │  [Annuler]               [Appliquer le reset]       │
   └─────────────────────────────────────────────────────┘

3. Si mode Hard : confirmation supplémentaire
   "Cette action est irréversible. Êtes-vous sûr ?"
   → saisie requise : taper "RESET" pour confirmer

4. Exécution → graphe mis à jour
```

---

## Protection des branches

Les actions de reset (destructives) sont bloquées par défaut sur les branches protégées (configurable dans Settings) :
- `main`, `master`, `develop` → bloqués par défaut
- Message d'erreur explicite si tentative
- Possibilité de débloquer dans Settings → Git → Protected Branches

---

## Commandes Tauri impliquées

| Command | Paramètres | Description |
|---------|-----------|-------------|
| `revert_commit` | `path, oid, no_commit?` | Revert avec ou sans auto-commit |
| `reset_to_commit` | `path, oid, mode: soft\|mixed\|hard` | Reset HEAD |
| `get_commits_between` | `path, from_oid, to_oid` | Liste des commits entre deux SHA |
| `get_revert_diff` | `path, oid` | Diff preview du revert avant exécution |

---

## Gestion des conflits

Si un `git revert` génère des conflits :
1. L'opération est interrompue avec statut `CONFLICT`
2. L'app passe en mode "Résolution de conflits"
3. Fichiers en conflit listés avec marqueurs visuels
4. Options : **Continuer le revert** (après résolution) / **Abandonner**

---

## Composants React

```
components/rollback/
├── RevertDialog.tsx         # Dialog prévisualisation revert
├── ResetDialog.tsx          # Dialog sélection mode reset
├── CommitListPreview.tsx    # Liste des commits qui seront défaits
├── HardResetConfirm.tsx     # Double-confirmation pour --hard
└── ConflictBanner.tsx       # Bannière si conflit post-revert
```

---

## i18n keys

```json
{
  "rollback.revert.title": "Revert \"{{message}}\"",
  "rollback.revert.description": "Cela va créer un nouveau commit qui annule ce changement.",
  "rollback.revert.confirm": "Confirmer le revert",
  "rollback.reset.title": "Reset jusqu'à ce commit",
  "rollback.reset.commitsAffected": "{{count}} commit(s) seront défaits",
  "rollback.reset.soft": "Soft — garder les changements (staged)",
  "rollback.reset.mixed": "Mixed — garder les changements (unstaged)",
  "rollback.reset.hard": "Hard — SUPPRIMER les changements",
  "rollback.reset.hardWarning": "Cette action est irréversible.",
  "rollback.reset.hardConfirmPlaceholder": "Tapez RESET pour confirmer",
  "rollback.protected.branch": "La branche {{branch}} est protégée. Modifiez les paramètres pour continuer.",
  "rollback.conflict": "Conflit lors du revert. Résolvez les conflits puis continuez."
}
```
