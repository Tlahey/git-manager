# `features/dashboard`

The dashboard — the app-level tab that lists every repository you have added, grouped into sections
you name and colour, with each row's git state and the bulk actions over a selection of them. It
also opens a repository's README and its AI daily briefing in the right-hand slot.

Like `launchpad`, and unlike `graph` / `board` / `files`, it is not one of a repo tab's three views:
it is a tab of its own, mounted by `App.tsx`.

## Layout

```
features/dashboard/
  index.ts                     the public surface — the ONLY thing outside code may import
  DashboardPage.tsx            the page: sections, rows, selection, the right-hand slot
  components/
    RepoSection / RepoSectionHeader / HiddenSectionsMenu / SectionColorPicker
    RepoRow / RepoRowStatus / RepoRowActions
    ReadmePanel / DailySummaryPanel   the two things the right-hand slot can show
  hooks/
    useDashboardSections.ts    the sections themselves, and which are hidden
    useRepoSelection.ts        multi-select across rows
    useBulkRepoAction.ts       fetch/pull over a selection, with its progress
    useSectionActions.ts       rename, recolour, reorder
    useRepoOwner / useRepoReadme / useRepoSummary / useMorningSummaries
  lib/
    remoteOwner.ts             `owner/repo` out of a remote URL — pure, no React
    sectionColor.config.ts     the section palette, keyed by colour name
  stores/
    dashboard.store.ts         the sections, their order, their colours, what is hidden
```

## What lives elsewhere, and why

- **`stores/settings.store.ts`** stays in `src/stores/`. It is the app's configuration — theme,
  language, AI provider, forge tokens — read by 25 hooks, the graph, the notch and `main.tsx`. The
  dashboard is one of its many readers, not its owner.
- **The package-health panel** (`components/package-health/`) — the graph mounts it too.
- **`hooks/useDailySummary.ts`** and `stores/dailySummary.store.ts` — the graph has its own
  summaries panel over the same data. Only `useMorningSummaries`, which is the dashboard's own
  "what happened while I was away" view, came along.
- **The repo list itself** (`stores/repoData.store.ts`, `stores/repoUI.store.ts`) — which
  repositories exist and which tabs are open is the app's state, not this page's. The dashboard
  stores how they are _arranged_ here, which is a different thing and is why it has a store at all.
- **The copy** (`packages/i18n`, `dashboard` namespace).

## The one import that skips the barrel

`lib/appConfig/hydrate.ts` imports `stores/dashboard.store` by its full path rather than through
`index.ts`, exactly as it already does for the board's and the Launchpad's. Going through the
barrel would pull `DashboardPage` — and the whole page tree behind it — into the hydration step
`main.tsx` awaits before the first paint, in every window. The rule stays "outside code imports the
barrel"; a store read before any UI exists is the case it does not cover.

## Why a feature folder

Its own page, its own persisted store, its own components, hooks and pure logic — and it already
had `components/` and `hooks/` subfolders, so this was a change of address rather than of shape.
The `CLAUDE.md` trigger is "its own page _and_ its own store _or_ its own `api/` domain"; it has
the first two. It has no `api/` of its own: it reads repositories through the app's `repo.api.ts`,
and one page's use of a shared API is not a domain.

**`app/settings/` deliberately did not follow.** It has the page and thirty-six components, but its
store is the app-wide configuration above and its API calls (`ssh.api`, `integrations.api`) are
shared with `hooks/` — neither half of the trigger. `app/<page>/components/` is the right shape for
it, and moving it would be churn against the rule rather than an application of it.
