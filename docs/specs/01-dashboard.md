# Spec 01 — Multi-repo dashboard

## Objective

Allow the user to manage several Git repositories from a central view. The dashboard is the entry point of the application.

---

## Overview

The dashboard is divided into two zones:

1. **Left sidebar** — list of registered repos, favorites at the top, real-time status
2. **Central zone** — repo cards with key information

Open repos are then displayed in **persistent tabs** at the top of the application.

---

## Features

### Adding repos

#### Manual

- **"Open a repo"** button → native macOS dialog (`tauri-plugin-dialog`) to select a folder
- Validation that the folder is indeed a Git repo (presence of `.git/`)
- Immediate addition to the list

#### Automatic scan

- **"Scan a folder"** button → selection of a root directory (e.g., `~/Projects`)
- Recursive scan up to a configurable depth (default: 3)
- List of found repos with a checkbox to select several
- Confirmation before adding
- Configurable exclusions (e.g., `node_modules`, `.pnpm-store`)

### Repo list

Each repo in the sidebar displays:

- Repo name (folder or manual override)
- Current HEAD branch
- Dirty indicator (•) if uncommitted changes exist
- Remote icon (GitHub/GitLab/other) if detectable
- Last activity (timestamp of the last commit)

### Dashboard cards

In the central view, each repo has a card with:

- Name + path
- HEAD branch + ahead/behind of the remote
- Number of modified files
- Author of the last commit + message + date
- Quick actions: Fetch, Pull, Open in tab

### Per-repo tabs

Each open repo generates a persistent tab:

- Tabs in the top bar (max ~8 visible, horizontal scroll)
- Individual closing (× on the tab)
- Dirty indicator on the tab
- Survives app restart (persisted state)

---

## List states

| State                | Display                          |
| -------------------- | -------------------------------- |
| Valid repo, clean    | Name in white, green branch icon |
| Dirty repo           | Orange dot next to the name      |
| Repo not found       | ⚠️ icon, grayed-out path         |
| Fetch in progress    | Spinner                          |
| Unresolved conflicts | Red icon                         |

---

## Main user flow

```
App launch
  │
  ├─ Previously registered repos → auto loading
  │     └─ Silent background fetch (optional, configurable)
  │
  └─ First launch
        └─ Welcome screen: "Open a repo" or "Scan a folder"
```

---

## Tauri commands involved

| Command                               | Description                                      |
| ------------------------------------- | ------------------------------------------------ |
| `scan_repos(root_path, max_depth)`    | Returns the list of found repos                  |
| `open_repo(path)` → `GitRepo`         | Opens and validates a repo, adds it to the state |
| `close_repo(path)`                    | Removes a repo from the active state             |
| `get_repo_status(path)` → `GitStatus` | Quick status (dirty, ahead/behind)               |
| `fetch_repo(path)`                    | Fetches from the default remote                  |

---

## Persistence

Via `tauri-plugin-store`:

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

## React components

```
app/dashboard/
├── DashboardPage.tsx         # Dashboard layout
├── RepoSidebar.tsx           # Left repo list
├── RepoCard.tsx              # Per-repo card
├── AddRepoDialog.tsx         # Manual add dialog
└── ScanDialog.tsx            # Scan + selection dialog
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
