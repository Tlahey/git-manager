# Spec 01 — Dashboard multi-repo

## Objectif

Permettre à l'utilisateur de gérer plusieurs dépôts Git depuis une vue centrale. Le dashboard est le point d'entrée de l'application.

---

## Vue d'ensemble

Le dashboard est divisé en deux zones :
1. **Sidebar gauche** — liste des repos enregistrés, favoris en tête, statut en temps réel
2. **Zone centrale** — cards de repos avec informations clés

Les repos ouverts s'affichent ensuite dans des **onglets persistants** en haut de l'application.

---

## Fonctionnalités

### Ajout de repos

#### Manuel
- Bouton **"Ouvrir un repo"** → dialog natif macOS (`tauri-plugin-dialog`) pour sélectionner un dossier
- Validation que le dossier est bien un repo Git (présence de `.git/`)
- Ajout immédiat à la liste

#### Scan automatique
- Bouton **"Scanner un dossier"** → sélection d'un répertoire racine (ex: `~/Projects`)
- Scan récursif jusqu'à une profondeur configurable (défaut : 3)
- Liste des repos trouvés avec case à cocher pour en sélectionner plusieurs
- Confirmation avant ajout
- Exclusions configurables (ex: `node_modules`, `.pnpm-store`)

### Liste des repos

Chaque repo dans la sidebar affiche :
- Nom du repo (dossier ou override manuel)
- Branche HEAD actuelle
- Indicateur dirty (•) si des modifications non commitées existent
- Icône remote (GitHub/GitLab/autre) si détectable
- Dernière activité (timestamp du dernier commit)

### Cards dashboard

En vue centrale, chaque repo a une card avec :
- Nom + chemin
- Branche HEAD + ahead/behind du remote
- Nombre de fichiers modifiés
- Auteur du dernier commit + message + date
- Actions rapides : Fetch, Pull, Ouvrir dans l'onglet

### Onglets par repo

Chaque repo ouvert génère un onglet persistant :
- Onglets dans la barre en haut (max ~8 visibles, scroll horizontal)
- Fermeture individuelle (× sur l'onglet)
- Indicateur dirty sur l'onglet
- Survie au redémarrage de l'app (état persisté)

---

## États de la liste

| État | Affichage |
|------|-----------|
| Repo valide, propre | Nom en blanc, icône branche verte |
| Repo dirty | Point orange à côté du nom |
| Repo introuvable | Icône ⚠️, chemin grisé |
| Fetch en cours | Spinner |
| Conflits non résolus | Icône rouge |

---

## Flux utilisateur principal

```
App launch
  │
  ├─ Repos précédemment enregistrés → chargement auto
  │     └─ Fetch silencieux en arrière-plan (optionnel, configurable)
  │
  └─ Premier lancement
        └─ Écran d'accueil : "Ouvrir un repo" ou "Scanner un dossier"
```

---

## Commandes Tauri impliquées

| Command | Description |
|---------|-------------|
| `scan_repos(root_path, max_depth)` | Retourne la liste des repos trouvés |
| `open_repo(path)` → `GitRepo` | Ouvre et valide un repo, l'ajoute à l'état |
| `close_repo(path)` | Retire un repo de l'état actif |
| `get_repo_status(path)` → `GitStatus` | Statut rapide (dirty, ahead/behind) |
| `fetch_repo(path)` | Fetch depuis le remote par défaut |

---

## Persistance

Via `tauri-plugin-store` :
```json
{
  "repos": [
    { "path": "/Users/x/Projects/myapp", "name": "myapp", "pinned": true },
    { "path": "/Users/x/Projects/api", "name": "api", "pinned": false }
  ],
  "scanPaths": ["/Users/x/Projects"],
  "openTabs": ["/Users/x/Projects/myapp"],
  "activeTab": "/Users/x/Projects/myapp"
}
```

---

## Composants React

```
app/dashboard/
├── DashboardPage.tsx         # Layout dashboard
├── RepoSidebar.tsx           # Liste repos gauche
├── RepoCard.tsx              # Card par repo
├── AddRepoDialog.tsx         # Dialog ajout manuel
└── ScanDialog.tsx            # Dialog scan + sélection
```

---

## i18n keys

```json
{
  "dashboard.title": "Tableau de bord",
  "dashboard.openRepo": "Ouvrir un repo",
  "dashboard.scanFolder": "Scanner un dossier",
  "dashboard.noRepos": "Aucun dépôt enregistré",
  "dashboard.repoNotFound": "Dépôt introuvable",
  "dashboard.dirty": "{{count}} modification(s) non commitée(s)",
  "dashboard.aheadBehind": "{{ahead}} en avance, {{behind}} en retard"
}
```
