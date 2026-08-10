# `features/launchpad`

The Launchpad — the app-level tab that answers "what is waiting on me?" across every GitHub repo
you follow, rather than inside one repository. Its inner tabs list your pull requests, the ones
waiting for your review, your WIP branches, your issues, what you snoozed, your custom views, your
contribution stats and your trophies.

Unlike `graph`, `board` and `files`, it is not one of a repo tab's three views: it is a tab of its
own, mounted by `App.tsx` beside the dashboard and the settings.

## Layout

```
features/launchpad/
  index.ts                     the public surface — the ONLY thing outside code may import
  PullRequestsPage.tsx         the layout: header, banner, KPI bar, tab bar, side panels
  components/
    LaunchpadHeader.tsx        the title bar: sync status and manual refresh
    <Inner>Tab.tsx             one per inner tab (prs, wip, followed, issues, waiting, snoozed,
                               stats, views, rewards)
    CustomViewResults          what one saved view matches; SavedFilterList is its rail
    RewardsSummary             rank + trophy cabinet; AchievementCard is one challenge
    PRRow / IssueRow           the list rows, and their quick actions
    Pr/IssueSidePanel.tsx      the right-hand detail slot, filled by the shared github-panels
    Open{Pr,Issue}Context.ts   how a row asks the page to open its detail panel
    Toolbar / ListHelpers / LaunchpadToolbar / LaunchpadKpiBar / FilterEditorDialog / …
  hooks/
    usePullRequestsPage.ts     the page's own state: pins, follows, snoozes, per-tab counts
    useLaunchpadTabs.tsx       the eight inner tabs — what each is called and renders
    useListToolbar.ts          one list tab's search, sort and three filters (all six share it)
    listHooks.ts               the PR sort and the set-filter primitive behind it
    useLocalWipRepos.ts        the WIP tab's local-branch side
    useGitHubRepoIssues.ts     the Issues tab's fetch
    usePendingPrOpen.ts        opening a PR the app was asked to show (notification, deep link)
  lib/
    prGroups / prSearch / prActions / githubTabs.config
    savedFilterMatch.ts        whether a PR or issue satisfies a custom view
    rewardVisuals.config.ts    the trophy board's palette, keyed by rank and tier
    filterEditor.config.ts     the filter editor's status/emoji/criterion vocabularies
    launchpadTypes.ts          this page's view state (sort key/dir, which inner tab)
    launchpadUtils.ts          snooze arithmetic, "is this issue mine", CI action link
  stores/
    launchpad.store.ts         what the user curated: follows, pins, snoozes, custom views
    launchpadControls.store.ts the transient controls (search text, filters) above the lists
```

## What lives elsewhere, and why

- **The GitHub view-models** (`MockPR`, `MockIssue`, `DayCommit`, the CI/review status vocabulary) —
  `lib/github/types.ts`. They were in this folder, which made `api/github/*`, the notification
  store, the dev fixtures and the graph's sidebar all import a page to name a type. A DTO every
  layer touches is not one feature's; see that file's doc comment.
- **The GitHub REST layer** (`api/github/*.api.ts`) — the board reads issues and labels through it
  too, so it is app infrastructure rather than this page's `api/` domain. This is the one feature
  folder with no `api/` of its own, and that is why.
- **The PR and issue detail panels** (`components/github-panels/`) and the ~20 `usePr*`/`useIssue*`
  hooks behind them. The graph view mounts the same panels in its centre, so neither screen owns
  them — see that folder's own README.
- **`issueBranchName` / `branchMatchesIssue`** (`lib/github/issueBranch.ts`) and the relative-date
  formatting (`lib/relativeDate.ts`'s `formatRelativeTimeCompact`) — the graph's sidebar reads the
  branch↔issue link and formats issue dates the same way, so those left with the types.
- **The mock PRs and issues** (`lib/devFixtures/mockData.ts`) — they feed the dev-fixture loader,
  not this page; the page only ever sees them through it.
- **The copy** (`packages/i18n`, `launchpad` namespace) and the **rewards engine** (`lib/rewards/`,
  `stores/game.store.ts`), which counts events from the whole app and merely renders one of its
  tabs here.

## The one import that skips the barrel

`lib/appConfig/hydrate.ts` and `lib/notifications/notificationRouting.ts` import
`stores/launchpad.store` by its full path instead of through `index.ts`, exactly as `hydrate.ts`
already does for the board's store. Going through the barrel would pull `PullRequestsPage` — and
the whole page tree behind it — into the hydration step that `main.tsx` awaits before the first
paint, in every window including the notch and the merge editor. The rule stays "outside code
imports the barrel"; a store read before any UI exists is the case it does not cover.

## Why a feature folder

It has its own page, its own two persisted stores, its own i18n namespace and its own pure logic —
and, before this move, those sat in four of the app's layer folders while a fifth (`lib/github`)
was hiding inside the page. The `CLAUDE.md` trigger is "its own page _and_ its own store _or_ its
own `api/` domain"; this has the first two.
