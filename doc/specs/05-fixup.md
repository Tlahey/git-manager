# Spec 05 — Fixup & Autosquash

## Objectif

Permettre de "corriger" un commit précédent en créant un commit `--fixup` ciblé, puis de nettoyer l'historique via `rebase --autosquash`.

---

## Concepts Git

### `git commit --fixup <commit>`

Crée un commit dont le message est `fixup! <message du commit cible>`. Ce commit est destiné à être fusionné avec la cible lors d'un rebase autosquash.

```
Avant fixup :
  A ← B ("feat: add login")
      ← C ("fix: typo in api")
      ← D (staged: correction pour B)

Après git commit --fixup B :
  A ← B ("feat: add login")
      ← C ("fix: typo in api")
      ← D ("fixup! feat: add login")

Après rebase --autosquash :
  A ← B' ("feat: add login" + corrections de D)
      ← C ("fix: typo in api")
```

### `git rebase -i --autosquash`

Réorganise automatiquement les commits `fixup!` après leur cible, puis les fusionne.

---

## Flux utilisateur

### Créer un fixup

```
1. L'utilisateur a des fichiers staged
2. Dans le panneau commit, menu déroulant → "Commit en tant que fixup"
   OU clic droit sur un commit du graphe → "Appliquer les changes staged comme fixup"

3. Sélecteur de commit cible :
   ┌──────────────────────────────────────────────────────┐
   │  Choisir le commit à corriger                        │
   │                                                      │
   │  🔍 [Rechercher dans l'historique...]                │
   │                                                      │
   │  ● abc1234  feat: add login page          2h ago    │
   │  ○ bcd2345  fix: typo in api              1j ago    │
   │  ○ cde3456  chore: update deps            3j ago    │
   │                                                      │
   │  [Annuler]                    [Créer le fixup]       │
   └──────────────────────────────────────────────────────┘

4. Commit créé → visible dans le graphe avec label "fixup!"
5. Toast : "Fixup créé pour 'feat: add login page'"
```

### Appliquer l'autosquash

```
1. Clic sur "Nettoyer l'historique (autosquash)"
   OU clic droit sur la branche → "Autosquash..."

2. Prévisualisation :
   ┌──────────────────────────────────────────────────────┐
   │  Autosquash — aperçu                                 │
   │                                                      │
   │  Les commits suivants seront fusionnés :             │
   │                                                      │
   │  ▶ abc1234  feat: add login page                    │
   │    └ def5678  fixup! feat: add login page           │
   │                                                      │
   │  ▶ bcd2345  fix: typo in api                        │
   │    └ ghi9012  fixup! fix: typo in api               │
   │                                                      │
   │  Résultat : 4 commits → 2 commits                   │
   │                                                      │
   │  ⚠️ Rebase depuis : cde3456 (il y a 3j)            │
   │                                                      │
   │  [Annuler]                   [Appliquer]            │
   └──────────────────────────────────────────────────────┘

3. Exécution → graphe mis à jour
4. Notification : "2 fixups appliqués, historique nettoyé"
```

---

## Détection des fixups en attente

Un badge/indicateur est affiché dans la barre de la branche quand des commits `fixup!` existent sans avoir été autosquashés :

```
🔧 2 fixups en attente  [Autosquash]
```

---

## Protections

- Interdit sur les commits **déjà poussés** sur un remote partagé (warning, non bloquant)
- Suggestion automatique d'autosquash si des commits `fixup!` sont détectés au lancement
- Blocage si des commits non liés seraient inclus dans la plage de rebase (confirmation requise)

---

## Commandes Tauri impliquées

| Command | Paramètres | Description |
|---------|-----------|-------------|
| `create_fixup_commit` | `path, target_oid` | Crée le commit `--fixup` |
| `get_pending_fixups` | `path` | Retourne la liste des fixups en attente |
| `autosquash_preview` | `path` | Retourne la liste des fusions qui seront faites |
| `run_autosquash` | `path, base_oid?` | Exécute `rebase --autosquash` |

---

## Composants React

```
components/fixup/
├── FixupTargetSelector.tsx   # Sélecteur de commit cible
├── AutosquashPreview.tsx     # Prévisualisation des fusions
├── PendingFixupsBadge.tsx    # Badge "N fixups en attente"
└── AutosquashResultToast.tsx # Notification post-exécution
```

---

## i18n keys

```json
{
  "fixup.createTitle": "Créer un commit fixup",
  "fixup.selectTarget": "Choisir le commit à corriger",
  "fixup.searchPlaceholder": "Rechercher dans l'historique...",
  "fixup.created": "Fixup créé pour \"{{message}}\"",
  "fixup.pending": "{{count}} fixup(s) en attente",
  "fixup.autosquash.title": "Autosquash — aperçu",
  "fixup.autosquash.result": "{{count}} commit(s) fusionnés",
  "fixup.autosquash.warning": "Ces commits ont déjà été poussés. Continuer ?"
}
```
