# Spec 12 — Left Sidebar (RepositorySidebar)

> Full implementation of the left-hand sidebar panel, resizable and feature-rich, inspired by GitKraken.

---

## Objective

Replace the basic `RepoBranchSidebar` (fixed 220px) with a `RepositorySidebar` featuring:
- **Resizable** width via drag-and-drop (min 140px, max 480px)
- **Collapse/expand** button to hide the sidebar
- **Accordion** sections: Local Branches, Remotes, Pull Requests, Tags, Submodules
- Local branches **grouped by prefix** (virtual folders `feat/`, `fix/`, `chore/`…)
- **Hover-expand** effect for long branch names (text that expands horizontally with an opaque background)

---

## Component architecture

```
apps/desktop/src/components/repository-sidebar/
├── index.ts                         ✅ Barrel export
├── RepositorySidebar.tsx            ✅ Main container + resize/collapse logic
├── SidebarResizeHandle.tsx          ✅ Resize handle (drag)
├── SectionHeader.tsx                ✅ Reusable collapsible header
├── BranchItem.tsx                   ✅ Branch row with hover-expand + ahead/behind + ⋮
├── BranchFolder.tsx                 ✅ Virtual folder by prefix (feat/, fix/…)
├── LocalBranchesSection.tsx         ✅ Local branches section (grouped)
├── RemotesSection.tsx               ✅ Remotes section by origin/upstream
├── PullRequestsSection.tsx          ✅ PRs section (My PRs + All PRs)
├── PullRequestItem.tsx              ✅ PR row with status badge + CI + hover-expand
├── TagsSection.tsx                  ✅ Tags section (with hover-expand)
├── SubmodulesSection.tsx            ✅ Submodules section
└── SidebarRail.tsx                  ✅ Rail mode (icons) when collapsed

apps/desktop/src/hooks/
├── useSidebarResize.ts              ✅ Resize + collapse handling (localStorage)
├── useGroupedBranches.ts            ✅ Branch grouping by prefix
└── usePullRequests.ts               ✅ GitHub REST API hook (public + token)
```

---

## Modified files

| File | Change |
|---------|-------------|
| `packages/git-types/src/index.ts` | ✅ Added `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus` |
| `apps/desktop/src-tauri/src/commands/submodule.rs` | ✅ Created — `list_submodules` command via git2 |
| `apps/desktop/src-tauri/src/commands/mod.rs` | ✅ `pub mod submodule` added |
| `apps/desktop/src-tauri/src/lib.rs` | ✅ `list_submodules` registered in `invoke_handler` |
| `apps/desktop/src/lib/tauri.ts` | ✅ Import `GitSubmodule` + `listSubmodules` wrapper |
| `apps/desktop/src/app/repo/RepoView.tsx` | ✅ Replaced `RepoBranchSidebar` with `RepositorySidebar` |

---

## Implementation tracking table

| # | Task | Status |
|---|-------|--------|
| 12.1 | Types `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus` | ✅ |
| 12.2 | Rust command `list_submodules` (git2) | ✅ |
| 12.3 | Tauri registration + `listSubmodules` wrapper | ✅ |
| 12.4 | `useSidebarResize` hook (drag, collapse, localStorage) | ✅ |
| 12.5 | `useGroupedBranches` hook (prefixes, threshold ≥2) | ✅ |
| 12.6 | `usePullRequests` hook (GitHub REST API, URL parsing) | ✅ |
| 12.7 | `SectionHeader` component | ✅ |
| 12.8 | `BranchItem` component (hover-expand, HEAD ●, ↑↓, ⋮) | ✅ |
| 12.9 | `BranchFolder` component (virtual prefix folder) | ✅ |
| 12.10 | `PullRequestItem` component (status badge, CI, hover-expand) | ✅ |
| 12.11 | `LocalBranchesSection` section | ✅ |
| 12.12 | `RemotesSection` section (grouped by remote) | ✅ |
| 12.13 | `PullRequestsSection` section (My PRs / All PRs) | ✅ |
| 12.14 | `TagsSection` section (getTags data) | ✅ |
| 12.15 | `SubmodulesSection` section (listSubmodules data) | ✅ |
| 12.16 | `SidebarResizeHandle` component | ✅ |
| 12.17 | `RepositorySidebar` component (main container) | ✅ |
| 12.18 | Integration into `RepoView.tsx` | ✅ |
| 12.19 | Rail mode (`SidebarRail`) — collapse into icons, never fully closed | ✅ |
| 12.20 | Typecheck verification | ✅ |
| 12.21 | cargo build verification | ✅ |

---

## Implemented UX specifics

### Hover-expand on long branch names

Implemented via **two overlapping `<span>` elements** — pure CSS/Tailwind, no JS:

```tsx
<div className="relative min-w-0 flex-1">
  {/* Truncated normally */}
  <span className="block truncate group-hover/branch:invisible">{name}</span>
  {/* Full on hover, absolute with opaque background */}
  <span className="pointer-events-none invisible absolute left-0 top-0 z-20
    whitespace-nowrap bg-card px-0.5 shadow-sm group-hover/branch:visible">
    {name}
  </span>
</div>
```

### Sidebar resize

Via `useRef` + `pointer capture` (`setPointerCapture` API):
- `pointerdown` on the handle → captures the pointer
- `pointermove` → computes the delta and updates the width (min/max clamp)
- `pointerup` → releases + persists to `localStorage`

### Collapse → rail mode (icons)

The sidebar **never closes** completely: it **shrinks into a rail** (`RAIL_WIDTH = 48px`) showing only the section icons with a count badge. The **expand** button (`PanelLeftOpen`) always remains visible at the top of the rail, and each section icon also expands the sidebar.

- **Expanded mode**: header with title + collapse button (`PanelLeftClose`), scrollable sections, resize handle.
- **Rail mode**: column of icons (`HardDrive`, `Globe`, `GitPullRequest`, `Tag`, `GitFork`) + count badges.
- `isCollapsed` state persisted in `localStorage` (`sidebar-collapsed`).

> **Fix**: the previous version used `width: 0 + overflow: hidden`, which clipped the reopen button (positioned at `absolute -right-3`) → impossible to reopen. Replaced with a true fixed-width rail mode.


---

## Technical decisions

- **PRs**: direct `fetch()` call to the GitHub REST API v3 from the frontend (no Rust command) — compatible with Tauri CSP if `https://api.github.com` is allowed in the capabilities
- **Collapse**: `width: 0 + overflow: hidden` (no icon rail)
- **Hover-expand**: two CSS spans, no JS
- **Width persistence**: `localStorage` (`sidebar-width`)
- `RepoBranchSidebar.tsx` kept (not removed, can be removed during a future cleanup)

---

## To do (future scope)

- [ ] Add `https://api.github.com` to the Tauri capabilities for HTTP requests
- [ ] Context menu on branches (checkout, delete, rename, merge)
- [ ] "Create branch" modal (+ button in the Local header)
- [ ] Support for GitHub token in settings for private repos
- [ ] GitHub Actions CI status on PRs (via `/repos/{owner}/{repo}/commits/{sha}/check-runs`)
- [ ] Issues section (future spec)
