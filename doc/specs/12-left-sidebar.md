# Spec 12 — Left Sidebar (RepositorySidebar)

> Implémentation complète du panneau latéral gauche, redimensionnable et riche, inspiré de GitKraken.

---

## Objectif

Remplacer le `RepoBranchSidebar` basique (220px fixe) par un `RepositorySidebar` avec :
- Largeur **redimensionnable** par glisser-déposer (min 140px, max 480px)
- Bouton **collapse/expand** pour masquer la sidebar
- Sections en **accordéon** : Local Branches, Remotes, Pull Requests, Tags, Submodules
- Branches locales **groupées par préfixe** (dossiers virtuels `feat/`, `fix/`, `chore/`…)
- Effet **hover-expand** pour les noms de branches longs (texte qui s'étend horizontalement avec fond opaque)

---

## Architecture des composants

```
apps/desktop/src/components/repository-sidebar/
├── index.ts                         ✅ Barrel export
├── RepositorySidebar.tsx            ✅ Conteneur principal + logique resize/collapse
├── SidebarResizeHandle.tsx          ✅ Handle de resize (drag)
├── SectionHeader.tsx                ✅ En-tête collapsible réutilisable
├── BranchItem.tsx                   ✅ Ligne branche avec hover-expand + ahead/behind + ⋮
├── BranchFolder.tsx                 ✅ Dossier virtuel par préfixe (feat/, fix/…)
├── LocalBranchesSection.tsx         ✅ Section branches locales (groupées)
├── RemotesSection.tsx               ✅ Section remotes par origin/upstream
├── PullRequestsSection.tsx          ✅ Section PRs (My PRs + All PRs)
├── PullRequestItem.tsx              ✅ Ligne PR avec badge statut + CI + hover-expand
├── TagsSection.tsx                  ✅ Section tags (avec hover-expand)
├── SubmodulesSection.tsx            ✅ Section submodules
└── SidebarRail.tsx                  ✅ Mode rail (icônes) quand collapsed

apps/desktop/src/hooks/
├── useSidebarResize.ts              ✅ Gestion resize + collapse (localStorage)
├── useGroupedBranches.ts            ✅ Groupement branches par préfixe
└── usePullRequests.ts               ✅ Hook GitHub REST API (public + token)
```

---

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `packages/git-types/src/index.ts` | ✅ Ajout `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus` |
| `apps/desktop/src-tauri/src/commands/submodule.rs` | ✅ Créé — commande `list_submodules` via git2 |
| `apps/desktop/src-tauri/src/commands/mod.rs` | ✅ `pub mod submodule` ajouté |
| `apps/desktop/src-tauri/src/lib.rs` | ✅ `list_submodules` enregistré dans `invoke_handler` |
| `apps/desktop/src/lib/tauri.ts` | ✅ Import `GitSubmodule` + wrapper `listSubmodules` |
| `apps/desktop/src/app/repo/RepoView.tsx` | ✅ Remplacé `RepoBranchSidebar` par `RepositorySidebar` |

---

## Tableau de suivi d'implémentation

| # | Tâche | Statut |
|---|-------|--------|
| 12.1 | Types `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus` | ✅ |
| 12.2 | Commande Rust `list_submodules` (git2) | ✅ |
| 12.3 | Enregistrement Tauri + wrapper `listSubmodules` | ✅ |
| 12.4 | Hook `useSidebarResize` (drag, collapse, localStorage) | ✅ |
| 12.5 | Hook `useGroupedBranches` (préfixes, seuil ≥2) | ✅ |
| 12.6 | Hook `usePullRequests` (GitHub REST API, parse URL) | ✅ |
| 12.7 | Composant `SectionHeader` | ✅ |
| 12.8 | Composant `BranchItem` (hover-expand, HEAD ●, ↑↓, ⋮) | ✅ |
| 12.9 | Composant `BranchFolder` (dossier virtuel préfixe) | ✅ |
| 12.10 | Composant `PullRequestItem` (badge statut, CI, hover-expand) | ✅ |
| 12.11 | Section `LocalBranchesSection` | ✅ |
| 12.12 | Section `RemotesSection` (groupée par remote) | ✅ |
| 12.13 | Section `PullRequestsSection` (My PRs / All PRs) | ✅ |
| 12.14 | Section `TagsSection` (données getTags) | ✅ |
| 12.15 | Section `SubmodulesSection` (données listSubmodules) | ✅ |
| 12.16 | Composant `SidebarResizeHandle` | ✅ |
| 12.17 | Composant `RepositorySidebar` (conteneur principal) | ✅ |
| 12.18 | Intégration dans `RepoView.tsx` | ✅ |
| 12.19 | Mode rail (`SidebarRail`) — collapse en icônes, jamais fermé | ✅ |
| 12.20 | Vérification typecheck | ✅ |
| 12.21 | Vérification cargo build | ✅ |

---

## UX spécifique implementée

### Hover-expand sur les noms de branches longs

Implémenté via **deux `<span>` superposés** — pur CSS/Tailwind, sans JS :

```tsx
<div className="relative min-w-0 flex-1">
  {/* Tronqué normalement */}
  <span className="block truncate group-hover/branch:invisible">{name}</span>
  {/* Complet au hover, absolu avec fond opaque */}
  <span className="pointer-events-none invisible absolute left-0 top-0 z-20
    whitespace-nowrap bg-card px-0.5 shadow-sm group-hover/branch:visible">
    {name}
  </span>
</div>
```

### Resize de la sidebar

Via `useRef` + `pointer capture` (API `setPointerCapture`) :
- `pointerdown` sur le handle → capture le pointeur
- `pointermove` → calcule le delta et met à jour la largeur (clamp min/max)
- `pointerup` → relâche + persiste en `localStorage`

### Collapse → mode rail (icônes)

La sidebar ne se **ferme jamais** complètement : elle se **réduit en rail** (`RAIL_WIDTH = 48px`) affichant uniquement les icônes des sections avec un badge de compteur. Le bouton **déplier** (`PanelLeftOpen`) reste toujours visible en haut du rail, et chaque icône de section déplie également la sidebar.

- **Mode déplié** : en-tête avec titre + bouton réduire (`PanelLeftClose`), sections scrollables, handle de resize.
- **Mode rail** : colonne d'icônes (`HardDrive`, `Globe`, `GitPullRequest`, `Tag`, `GitFork`) + badges de compteurs.
- État `isCollapsed` persisté en `localStorage` (`sidebar-collapsed`).

> **Correctif** : l'ancienne version utilisait `width: 0 + overflow: hidden`, ce qui clippait le bouton de réouverture (positionné en `absolute -right-3`) → impossible de rouvrir. Remplacé par un vrai mode rail à largeur fixe.


---

## Décisions techniques

- **PRs** : appel direct `fetch()` GitHub REST API v3 depuis le frontend (pas de commande Rust) — compatible avec Tauri CSP si `https://api.github.com` autorisé dans les capabilities
- **Collapse** : `width: 0 + overflow: hidden` (pas de rail icônes)
- **Hover-expand** : deux spans CSS, pas de JS
- **Persistance largeur** : `localStorage` (`sidebar-width`)
- `RepoBranchSidebar.tsx` conservé (non supprimé, peut être retiré lors d'un cleanup)

---

## À faire (scope futur)

- [ ] Ajouter `https://api.github.com` dans les capabilities Tauri pour les requêtes HTTP
- [ ] Menu contextuel sur les branches (checkout, delete, rename, merge)
- [ ] Modal "Créer une branche" (bouton + dans le header Local)
- [ ] Support token GitHub dans les settings pour les repos privés
- [ ] GitHub Actions CI status sur les PRs (via `/repos/{owner}/{repo}/commits/{sha}/check-runs`)
- [ ] Issues section (spec future)
