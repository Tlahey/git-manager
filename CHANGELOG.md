# Changelog

Notable changes to git-manager, release by release. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This file is bundled into the app and rendered
on Settings → Changelog (and via the version badge in the footer).

## [Unreleased]

_Auto-populated at release time from the merged pull requests since the last tag, via the GitHub release notes API — see tools/release/cut-release.sh._

## [0.3.0] - 2026-08-12

## What's Changed
* docs(release): add local release tooling and rewrite the release-process skill by @Tlahey in https://github.com/Tlahey/git-manager/pull/320
* feat(tray): use a monochrome mascot mark for the macOS menu bar icon by @Tlahey in https://github.com/Tlahey/git-manager/pull/319
* feat(splash): rebuild the startup splash as a lit underwater scene by @Tlahey in https://github.com/Tlahey/git-manager/pull/321
* chrore: divers fixes, changes by @Tlahey in https://github.com/Tlahey/git-manager/pull/322
* chore(deps): consolidate the pnpm catalog and update every dependency, majors included by @Tlahey in https://github.com/Tlahey/git-manager/pull/323
* feat(settings): default to 32px rows, on one shared segmented control by @Tlahey in https://github.com/Tlahey/git-manager/pull/324
* fix(notifications): stop a notch card repainting the whole app dark by @Tlahey in https://github.com/Tlahey/git-manager/pull/325
* feat(launchpad,sidebar): ask for a GitHub account instead of failing without one by @Tlahey in https://github.com/Tlahey/git-manager/pull/326
* feat(sidebar): open the clicked section when expanding from the collapsed rail by @Tlahey in https://github.com/Tlahey/git-manager/pull/327
* fix(branch): check out a remote branch as a local one, not a detached HEAD by @Tlahey in https://github.com/Tlahey/git-manager/pull/328
* fix(rewards): only unlock an achievement for something the user did by @Tlahey in https://github.com/Tlahey/git-manager/pull/329
* feat(config): persist the app configuration in ~/.git-manager/settings.json by @Tlahey in https://github.com/Tlahey/git-manager/pull/330
* feat(board): column-wide actions, iteration boards, and a say in what a delete takes by @Tlahey in https://github.com/Tlahey/git-manager/pull/333
* feat(board): give every ticket an identifier, and its type a colour by @Tlahey in https://github.com/Tlahey/git-manager/pull/335
* feat(repo): scope a repo tab's chrome to the view on screen by @Tlahey in https://github.com/Tlahey/git-manager/pull/336
* feat(board): an autocompleting prefix, a kind dropdown, and a new-card form that reads as one line by @Tlahey in https://github.com/Tlahey/git-manager/pull/338
* feat(board): a Definition of Done written as a list, and a card that sits on the page's own surface by @Tlahey in https://github.com/Tlahey/git-manager/pull/339
* fix(ui): read a tooltip child's ref from its props, not from the element by @Tlahey in https://github.com/Tlahey/git-manager/pull/340
* feat(board): a card's fields answer a click with their values, and a card wears its kind on its edge by @Tlahey in https://github.com/Tlahey/git-manager/pull/341
* feat(board): a parent chosen over the card, and a relation written as a line of its own list by @Tlahey in https://github.com/Tlahey/git-manager/pull/342
* fix(ui): a command run from another view lands where its result is drawn by @Tlahey in https://github.com/Tlahey/git-manager/pull/343
* chore(tooling): make prettier a gate, and format the repo once by @Tlahey in https://github.com/Tlahey/git-manager/pull/344
* fix(notifications): a card arrives without taking the keyboard by @Tlahey in https://github.com/Tlahey/git-manager/pull/345
* fix(ai): a running card names the action, and the ✕ on a live card means it by @Tlahey in https://github.com/Tlahey/git-manager/pull/346
* fix(graph): a hovered commit no longer covers the search it scrolls under by @Tlahey in https://github.com/Tlahey/git-manager/pull/347
* fix(board): the archive list fits the window instead of being cut off at it by @Tlahey in https://github.com/Tlahey/git-manager/pull/348
* feat(palette): a verb before its ref, and the letters you typed where you typed them by @Tlahey in https://github.com/Tlahey/git-manager/pull/349
* fix(settings): the GitHub activation button becomes a real button, and the code stops wrapping by @Tlahey in https://github.com/Tlahey/git-manager/pull/351
* fix(settings): the GitHub login stops waiting forever after you have already approved it by @Tlahey in https://github.com/Tlahey/git-manager/pull/352
* refactor(launchpad): the Launchpad becomes one folder by @Tlahey in https://github.com/Tlahey/git-manager/pull/350
* refactor(ui): the twelve hand-rolled panel close buttons become one shared Button by @Tlahey in https://github.com/Tlahey/git-manager/pull/353
* refactor(dashboard): the dashboard becomes one folder, and settings deliberately does not by @Tlahey in https://github.com/Tlahey/git-manager/pull/354
* refactor(graph): GitGraph stops deciding what fills its two slots inline by @Tlahey in https://github.com/Tlahey/git-manager/pull/355
* refactor(graph): three passes over the graph — context menus, synthetic rows, sidebar sections by @Tlahey in https://github.com/Tlahey/git-manager/pull/359
* refactor(graph): three files that were doing four jobs each by @Tlahey in https://github.com/Tlahey/git-manager/pull/360
* refactor(graph): the sidebar's sections and the WIP panel's forms come out of their hosts by @Tlahey in https://github.com/Tlahey/git-manager/pull/361
* refactor(graph): GitGraph sheds five concerns, and two sidebar rows become one by @Tlahey in https://github.com/Tlahey/git-manager/pull/362
* refactor: the IPC layer splits by domain, and three copied helpers become one each by @Tlahey in https://github.com/Tlahey/git-manager/pull/363
* refactor(files): the file tree's two rows leave the list that renders them by @Tlahey in https://github.com/Tlahey/git-manager/pull/364
* refactor(store): the repo tab's UI state stops being half a type declaration by @Tlahey in https://github.com/Tlahey/git-manager/pull/365
* refactor(ai-search): the AI commit search becomes a feature of its own, + footer tooltip by @Tlahey in https://github.com/Tlahey/git-manager/pull/366
* refactor(settings): the GitHub panel becomes the four things it renders by @Tlahey in https://github.com/Tlahey/git-manager/pull/369
* refactor(settings): the page and the appearance panel stop carrying their own tables by @Tlahey in https://github.com/Tlahey/git-manager/pull/370
* refactor(board): the remote board's config file, and the migrations hiding in it by @Tlahey in https://github.com/Tlahey/git-manager/pull/372
* test(board): cover the remote backend's writes that reach a user's real issues by @Tlahey in https://github.com/Tlahey/git-manager/pull/373
* refactor(board): the remote backend splits, but not along the seam I predicted by @Tlahey in https://github.com/Tlahey/git-manager/pull/374
* refactor(graph): the virtualised row list, and the two rules buried in it by @Tlahey in https://github.com/Tlahey/git-manager/pull/375
* fix(a11y): give every icon-only control a real name, not just a native tooltip by @Tlahey in https://github.com/Tlahey/git-manager/pull/376
* feat(a11y): the names land on the keyboard too, not just under the mouse by @Tlahey in https://github.com/Tlahey/git-manager/pull/377
* fix(merge): Apply wrote an empty file wherever there was no result pane by @Tlahey in https://github.com/Tlahey/git-manager/pull/378
* refactor(editor): make the merge geometry's recorded invariants true again by @Tlahey in https://github.com/Tlahey/git-manager/pull/379
* refactor(editor): lift the pane-mount wiring out of the resolver by @Tlahey in https://github.com/Tlahey/git-manager/pull/380
* refactor(editor): separate the theme table from the theme that computes itself by @Tlahey in https://github.com/Tlahey/git-manager/pull/381
* refactor(editor): drop the color token nothing produced, and the CSS behind it by @Tlahey in https://github.com/Tlahey/git-manager/pull/382
* fix(a11y): name the merge editor's controls, and let a host translate them by @Tlahey in https://github.com/Tlahey/git-manager/pull/383
* fix(notch): a card no longer costs the user their focus, and stop actually stops by @Tlahey in https://github.com/Tlahey/git-manager/pull/371
* fix(ai): the daily summary can be stopped, and stops when nobody is watching by @Tlahey in https://github.com/Tlahey/git-manager/pull/384
* docs: give the loose markdown a folder, and every link a target by @Tlahey in https://github.com/Tlahey/git-manager/pull/388
* fix(window): let the window be moved while the app is loading by @Tlahey in https://github.com/Tlahey/git-manager/pull/390
* fix(theme): give glass's tone chips a margin over the APCA bar, not a rounding error by @Tlahey in https://github.com/Tlahey/git-manager/pull/387
* feat(dev): let a developer see the themes they haven't earned by @Tlahey in https://github.com/Tlahey/git-manager/pull/389
* feat(files): list the repository's tracked files, not the working directory by @Tlahey in https://github.com/Tlahey/git-manager/pull/391
* refactor(ui): give every search box in the app the same field by @Tlahey in https://github.com/Tlahey/git-manager/pull/392
* feat(i18n): add Spanish as a third supported language by @Tlahey in https://github.com/Tlahey/git-manager/pull/393
* fix(branch): switch the project a branch belongs to, not the worktree on screen by @Tlahey in https://github.com/Tlahey/git-manager/pull/395
* feat(security): move every secret to the keychain, where the webview cannot reach it by @Tlahey in https://github.com/Tlahey/git-manager/pull/394
* fix(i18n): give Spanish the eight keys it was missing by @Tlahey in https://github.com/Tlahey/git-manager/pull/397
* fix(editor): the diff arrives already collapsed, instead of assembling itself in view by @Tlahey in https://github.com/Tlahey/git-manager/pull/396
* feat(error-report): turn a failure into a GitHub issue the user reads before sending by @Tlahey in https://github.com/Tlahey/git-manager/pull/398
* feat(markdown): a formatting toolbar and a formatted editing mode for every markdown field by @Tlahey in https://github.com/Tlahey/git-manager/pull/399
* feat(terminal): bind a shell to its worktree, and say from the sidebar what is running where by @Tlahey in https://github.com/Tlahey/git-manager/pull/400


**Full Changelog**: https://github.com/Tlahey/git-manager/compare/v0.2.1...v0.3.0

## [0.2.1] - 2026-08-06

Release tooling only — no app-facing changes.

## What's Changed
* Rotate the Tauri updater signing key (safe now: v0.2.0 was the only release built against the previous one)
* Add `tools/release/build-local.sh` (`pnpm release:build:local`) — builds the macOS bundle on this machine instead of waiting on CI, signs automatically if `~/.tauri/git-manager-release.env` is present
* Add `tools/release/cut-release.sh` (`pnpm release`) — runs the whole release process locally (pre-flight checks, version bump, changelog, commit, tag, push), replacing `prepare-release.yml`'s job, which can't push to `main` under this repo's branch protection
* Add `--local-build` to `cut-release.sh` — builds, signs and drafts the release from this machine instead of waiting 15-20+ minutes on GitHub's 10x-billed macOS runner
* Fix `.github/workflows/release.yml`'s release title (`v0.2.0`, not `git-manager v0.2.0`), matching `v0.1.0`'s convention

**Full Changelog**: https://github.com/Tlahey/git-manager/compare/v0.2.0...v0.2.1

## [0.2.0] - 2026-08-05

## What's Changed
* Architecture refactor plan + Phase 1 dedup cleanup by @Tlahey in https://github.com/Tlahey/git-manager/pull/1
* Architecture refactor: Phase 2 (frontend hooks/store split) + Phase 3 (Rust service layer) by @Tlahey in https://github.com/Tlahey/git-manager/pull/2
* Architecture refactor: Phase 4 (event bus) + Phase 5 (scope correction) by @Tlahey in https://github.com/Tlahey/git-manager/pull/3
* Architecture refactor: extract commit-graph layout into services/git_graph.rs by @Tlahey in https://github.com/Tlahey/git-manager/pull/4
* refactor: extract data derivation and actions hooks from GitGraph by @Tlahey in https://github.com/Tlahey/git-manager/pull/5
* refactor: extract WIP commit panel logic into useWipCommitPanel hook by @Tlahey in https://github.com/Tlahey/git-manager/pull/6
* refactor: extract commit message editing into useCommitMessageEdit hook by @Tlahey in https://github.com/Tlahey/git-manager/pull/7
* fix: route remaining components through existing api/*.api.ts wrappers by @Tlahey in https://github.com/Tlahey/git-manager/pull/8
* fix: add missing read wrappers to git.api.ts and migrate 11 hooks/components by @Tlahey in https://github.com/Tlahey/git-manager/pull/9
* fix: add remaining api/*.api.ts wrappers, complete R2 layering migration by @Tlahey in https://github.com/Tlahey/git-manager/pull/10
* refactor: extract action handlers into useActionToolbar hook by @Tlahey in https://github.com/Tlahey/git-manager/pull/11
* docs: sync architecture docs with reality, move doc/ to docs/ in English by @Tlahey in https://github.com/Tlahey/git-manager/pull/12
* refactor: extract rewards rule engine into lib/rewards (Strategy/Registry) by @Tlahey in https://github.com/Tlahey/git-manager/pull/13
* refactor: tab registry + panel/dialog orchestration cleanup by @Tlahey in https://github.com/Tlahey/git-manager/pull/14
* refactor: extract Rust service layer for branch/remote/stash/rollback/fixup by @Tlahey in https://github.com/Tlahey/git-manager/pull/15
* refactor: consolidate anchored-menu logic + finish Section type dedup by @Tlahey in https://github.com/Tlahey/git-manager/pull/16
* fix: implement missing create_branch and get_rebase_state commands by @Tlahey in https://github.com/Tlahey/git-manager/pull/17
* refactor: notification type registry + tray/hide-on-close background delivery by @Tlahey in https://github.com/Tlahey/git-manager/pull/18
* fix: hide locked themes from appearance theme picker by @Tlahey in https://github.com/Tlahey/git-manager/pull/19
* fix: cap commit description height with scroll in details panel by @Tlahey in https://github.com/Tlahey/git-manager/pull/20
* feat: add commit context-menu actions (checkout, cherry-pick, tags, worktree, patch, compare) by @Tlahey in https://github.com/Tlahey/git-manager/pull/21
* feat: add 3-way merge conflict resolution editor by @Tlahey in https://github.com/Tlahey/git-manager/pull/22
* feat: JetBrains/WebStorm-style visuals for the 3-way merge editor by @Tlahey in https://github.com/Tlahey/git-manager/pull/23
* Adapt diff merge design by @Tlahey in https://github.com/Tlahey/git-manager/pull/24
* feat: extract generic ConflictResolver into @git-manager/code-view (storybook + playwright e2e) by @Tlahey in https://github.com/Tlahey/git-manager/pull/25
* feat: shared octopus mascot package (sprite rig) + Vite landing page by @Tlahey in https://github.com/Tlahey/git-manager/pull/26
* test(desktop): exhaustive Vitest coverage across apps/desktop/src by @Tlahey in https://github.com/Tlahey/git-manager/pull/27
* chore: align shared dependency versions via pnpm catalog by @Tlahey in https://github.com/Tlahey/git-manager/pull/28
* test: add Vitest coverage for the last two untested React files by @Tlahey in https://github.com/Tlahey/git-manager/pull/29
* refactor: remove unused advanced/git/language settings sections by @Tlahey in https://github.com/Tlahey/git-manager/pull/30
* chore: add reusable-components and test-coverage-guardian skills by @Tlahey in https://github.com/Tlahey/git-manager/pull/32
* test: add Vitest coverage across packages/ui, mascot, code-view, components by @Tlahey in https://github.com/Tlahey/git-manager/pull/31
* refactor(code-view): split ConflictResolver into modules/hooks + centralize config by @Tlahey in https://github.com/Tlahey/git-manager/pull/33
* fix(code-view): correct collapsed-region banner positioning by @Tlahey in https://github.com/Tlahey/git-manager/pull/34
* feat: debug ipc log by @Tlahey in https://github.com/Tlahey/git-manager/pull/35
* feat(fixup): warn before committing a fixup likely to conflict by @Tlahey in https://github.com/Tlahey/git-manager/pull/36
* test(e2e): WebdriverIO + Cucumber e2e harness for the Tauri app by @Tlahey in https://github.com/Tlahey/git-manager/pull/37
* test(e2e): coverage matrix + 3 fixture features + visual snapshots by @Tlahey in https://github.com/Tlahey/git-manager/pull/38
* test(e2e): merge editor, settings & working-tree features with visual snapshots by @Tlahey in https://github.com/Tlahey/git-manager/pull/39
* test(e2e): undo/redo of a checkout + committing staged changes by @Tlahey in https://github.com/Tlahey/git-manager/pull/40
* build: replace ESLint with Oxlint, fix pnpm format by @Tlahey in https://github.com/Tlahey/git-manager/pull/41
* chore: bump typescript to v7.0.2 by @Tlahey in https://github.com/Tlahey/git-manager/pull/42
* feat(landing): polish landing page, fix mascot rig, auto-captured app screenshots by @Tlahey in https://github.com/Tlahey/git-manager/pull/43
* docs: move project-state sections from README to docs/, fix TypeScript badge by @Tlahey in https://github.com/Tlahey/git-manager/pull/44
* chore: adopt TypeScript 7 native editor tooling by @Tlahey in https://github.com/Tlahey/git-manager/pull/45
* build: move @types/node into the pnpm catalog by @Tlahey in https://github.com/Tlahey/git-manager/pull/46
* docs: add LICENSE and CONTRIBUTING by @Tlahey in https://github.com/Tlahey/git-manager/pull/47
* build: migrate to pnpm 11 and Node 24, centralize versions by @Tlahey in https://github.com/Tlahey/git-manager/pull/48
* fix(landing): layout fixes, real app screenshot, rewards & launchpad cards by @Tlahey in https://github.com/Tlahey/git-manager/pull/49
* fix(pull-requests): fix flaky mockData weekend commit cap test by @Tlahey in https://github.com/Tlahey/git-manager/pull/50
* feat(mascot): rebuild sprite rig with baked-in face and re-editable paint order by @Tlahey in https://github.com/Tlahey/git-manager/pull/51
* feat(desktop): add instant startup splash screen by @Tlahey in https://github.com/Tlahey/git-manager/pull/52
* feat(command-palette): add Cmd+K command palette and expand e2e coverage by @Tlahey in https://github.com/Tlahey/git-manager/pull/53
* feat(mascot): re-add eye tracking and blinking on the baked-in face by @Tlahey in https://github.com/Tlahey/git-manager/pull/54
* feat(undo): support undo/redo for revert, branch creation, and tag creation by @Tlahey in https://github.com/Tlahey/git-manager/pull/55
* chore: remove dead SubmodulesSection component by @Tlahey in https://github.com/Tlahey/git-manager/pull/56
* feat(ai): rework AI commit generation as an extensible multi-provider architecture by @Tlahey in https://github.com/Tlahey/git-manager/pull/57
* fix(settings): add missing i18n keys for rewards section by @Tlahey in https://github.com/Tlahey/git-manager/pull/58
* feat(ui): validate theme accessibility and fix WCAG AA contrast by @Tlahey in https://github.com/Tlahey/git-manager/pull/59
* feat(worktree): add sidebar UI for worktree list/add/remove by @Tlahey in https://github.com/Tlahey/git-manager/pull/60
* test(github): add e2e coverage for the OAuth device flow by @Tlahey in https://github.com/Tlahey/git-manager/pull/61
* test(code-view): fix TwoPanelDiff toolbar assertion in conflict-resolver e2e by @Tlahey in https://github.com/Tlahey/git-manager/pull/62
* Migrate file diff view to code-view's ConflictResolver by @Tlahey in https://github.com/Tlahey/git-manager/pull/63
* chore: remove dead repository-sidebar components by @Tlahey in https://github.com/Tlahey/git-manager/pull/64
* feat(theme): add Obsidian theme with dark sidebar/tab-bar chrome by @Tlahey in https://github.com/Tlahey/git-manager/pull/65
* feat(diff-viewer): file blame and history by @Tlahey in https://github.com/Tlahey/git-manager/pull/66
* refactor(editor): consolidate all Monaco integration into @git-manager/editor by @Tlahey in https://github.com/Tlahey/git-manager/pull/67
* feat(settings): searchable provider combobox for AI settings by @Tlahey in https://github.com/Tlahey/git-manager/pull/68
* fix(e2e): eliminate cross-feature window leak and latency-timeout flakes by @Tlahey in https://github.com/Tlahey/git-manager/pull/69
* fix(i18n,e2e): translate rewards settings tab, deflake merge-editor accept-right step by @Tlahey in https://github.com/Tlahey/git-manager/pull/70
* feat(ai): centralize LLM instruction + service in @git-manager/ai by @Tlahey in https://github.com/Tlahey/git-manager/pull/71
* feat(ai): per-feature AI runtime, commit-batch review & repo-aware commit style by @Tlahey in https://github.com/Tlahey/git-manager/pull/72
* feat(ai): per-project daily summary briefing in the launchpad by @Tlahey in https://github.com/Tlahey/git-manager/pull/73
* feat(desktop): in-app auto-updater + release pipeline by @Tlahey in https://github.com/Tlahey/git-manager/pull/74
* feat(desktop): in-app changelog page + automated release notes by @Tlahey in https://github.com/Tlahey/git-manager/pull/76
* feat(release): PR-based changelog generation + release-process skill by @Tlahey in https://github.com/Tlahey/git-manager/pull/77
* feat(desktop): in-app GitHub pull request workflow + per-repo settings by @Tlahey in https://github.com/Tlahey/git-manager/pull/78
* feat(pr): create a PR from the sidebar "Pull Requests" + by @Tlahey in https://github.com/Tlahey/git-manager/pull/79
* feat: open repo in a user-picked external editor/terminal by @Tlahey in https://github.com/Tlahey/git-manager/pull/80
* fix(github): PR view/sidebar don't refresh right after merge by @Tlahey in https://github.com/Tlahey/git-manager/pull/82
* feat(toolbar): Actions/Search buttons + ⌘F commit find panel by @Tlahey in https://github.com/Tlahey/git-manager/pull/83
* feat(graph): merge-commit dots, multi-worktree WIP rows, stash/origin dash fixes by @Tlahey in https://github.com/Tlahey/git-manager/pull/84
* fix(sidebar): strip redundant folder prefix from local branch labels by @Tlahey in https://github.com/Tlahey/git-manager/pull/85
* feat(sidebar): collapsible sections with bounded scroll, ⌥⌘F focus, full shortcuts list by @Tlahey in https://github.com/Tlahey/git-manager/pull/86
* Sidebar: full-panel search, ⌥⌘F fix, equal-height sections by @Tlahey in https://github.com/Tlahey/git-manager/pull/87
* feat(settings): add a Support section to sponsor the project by @Tlahey in https://github.com/Tlahey/git-manager/pull/88
* feat(splash): enlarge mascot, title, spinner, and bubbles by @Tlahey in https://github.com/Tlahey/git-manager/pull/89
* style(git-graph): stop row band at node center and fill dashed rings by @Tlahey in https://github.com/Tlahey/git-manager/pull/90
* feat(worktrees): workspace view, merged-worktree bulk cleanup, and accurate dirty detection by @Tlahey in https://github.com/Tlahey/git-manager/pull/91
* feat(i18n): add translation key validation script by @Tlahey in https://github.com/Tlahey/git-manager/pull/92
* fix(settings): remove padding and border-radius on integrations panel by @Tlahey in https://github.com/Tlahey/git-manager/pull/93
* fix(git-graph): align worktree WIP lanes, tighten spacing, link top merge by @Tlahey in https://github.com/Tlahey/git-manager/pull/94
* feat(branches): local-branch prune/cleanup, sidebar create-branch, and "my merged" filters by @Tlahey in https://github.com/Tlahey/git-manager/pull/95
* feat(worktree): searchable base-branch picker & smarter default path by @Tlahey in https://github.com/Tlahey/git-manager/pull/96
* fix(test): satisfy WorktreeWipStatus shape in useGitGraphNodes test by @Tlahey in https://github.com/Tlahey/git-manager/pull/97
* feat(worktree): default files copied into new worktrees by @Tlahey in https://github.com/Tlahey/git-manager/pull/98
* fix(git-graph): keep merge lanes flowing through inserted WIP rows by @Tlahey in https://github.com/Tlahey/git-manager/pull/99
* feat(command-palette): focus a commit in the graph from a SHA lookup by @Tlahey in https://github.com/Tlahey/git-manager/pull/100
* feat(tasks): launch project tasks from the toolbar by @Tlahey in https://github.com/Tlahey/git-manager/pull/101
* fix(git-graph): keep the WIP dashed line dashed until it touches a node by @Tlahey in https://github.com/Tlahey/git-manager/pull/102
* feat(theme): @git-manager/theme extraction, Twilight rename, WCAG+APCA a11y enforcement by @Tlahey in https://github.com/Tlahey/git-manager/pull/103
* chore(a11y): drop dead exports from the a11y test harness by @Tlahey in https://github.com/Tlahey/git-manager/pull/104
* feat(git-graph): resizable graph column, WIP lane fixes, branch/worktree WIP tags by @Tlahey in https://github.com/Tlahey/git-manager/pull/105
* fix(tests): stop useDefaultFileMatchCounts test hanging under vitest fake timers by @Tlahey in https://github.com/Tlahey/git-manager/pull/106
* fix(git-graph): UI polish — labels, header alignment, resize & compact columns by @Tlahey in https://github.com/Tlahey/git-manager/pull/107
* feat(git-graph): filter graph by author + centralize z-index scale by @Tlahey in https://github.com/Tlahey/git-manager/pull/108
* fix(settings): clear CommandAutocomplete blur timer on unmount by @Tlahey in https://github.com/Tlahey/git-manager/pull/109
* feat(toolbar): badge unpushed/unpulled commits on Push/Pull buttons by @Tlahey in https://github.com/Tlahey/git-manager/pull/110
* feat(git-graph): hint a commit's owning branch on row hover by @Tlahey in https://github.com/Tlahey/git-manager/pull/111
* feat(git-graph): show AI-agent activity on worktree WIP rows by @Tlahey in https://github.com/Tlahey/git-manager/pull/112
* feat(settings): grouped side panel + graph/fetch/branch settings by @Tlahey in https://github.com/Tlahey/git-manager/pull/113
* feat(ui): shared accessible Checkbox/Switch/RadioGroup/Label + graphical-contrast a11y gate by @Tlahey in https://github.com/Tlahey/git-manager/pull/114
* fix(desktop): darken avatar palette so white initials clear APCA Bronze by @Tlahey in https://github.com/Tlahey/git-manager/pull/115
* feat(ui): consolidate shared components, adopt primitives, document consume-first by @Tlahey in https://github.com/Tlahey/git-manager/pull/116
* feat(patch): patch workspace — create, apply & dependency patches by @Tlahey in https://github.com/Tlahey/git-manager/pull/117
* fix(git-graph): hover branch attribution + inline optimized splash logo by @Tlahey in https://github.com/Tlahey/git-manager/pull/118
* feat(timeline): undo/redo history timeline navigator by @Tlahey in https://github.com/Tlahey/git-manager/pull/119
* feat(i18n): migrate hardcoded UI text to i18n and test against real English copy by @Tlahey in https://github.com/Tlahey/git-manager/pull/120
* feat(git-graph): drag-and-drop a branch/tag onto another to act on it by @Tlahey in https://github.com/Tlahey/git-manager/pull/121
* Graph ref-label cleanup, checked-out-branch lane, and worktree/branch dedupe by @Tlahey in https://github.com/Tlahey/git-manager/pull/122
* feat(git-graph): summarize merged diff of a multi-commit selection by @Tlahey in https://github.com/Tlahey/git-manager/pull/123
* fix(git-graph): assign columns top-down and make the WIP row an input of the layout by @Tlahey in https://github.com/Tlahey/git-manager/pull/124
* feat(git-graph): declarative context menus + tag/branch/WIP/multi-select coverage by @Tlahey in https://github.com/Tlahey/git-manager/pull/135
* feat(git-graph): solo mode to isolate branches in the graph by @Tlahey in https://github.com/Tlahey/git-manager/pull/136
* feat(git-graph): inline tag creation input in the refs column by @Tlahey in https://github.com/Tlahey/git-manager/pull/138
* feat(sidebar): PR status tag on branch/worktree rows and toolbar by @Tlahey in https://github.com/Tlahey/git-manager/pull/139
* feat(activity-logs): migrate app logs to a footer Activity Logs view by @Tlahey in https://github.com/Tlahey/git-manager/pull/140
* feat(bisect): integrate a git bisect view by @Tlahey in https://github.com/Tlahey/git-manager/pull/141
* feat(command-palette): search a file to open its contents and history by @Tlahey in https://github.com/Tlahey/git-manager/pull/142
* feat(launchpad): make PR CI status link to its GitHub run by @Tlahey in https://github.com/Tlahey/git-manager/pull/143
* feat(terminal): integrated PTY terminal + searchable settings by @Tlahey in https://github.com/Tlahey/git-manager/pull/144
* feat(settings): move app updater to side panel footer with startup check by @Tlahey in https://github.com/Tlahey/git-manager/pull/146
* feat(ui): loading overlay + splash gating, WIP header, Launchpad groups & toolbar by @Tlahey in https://github.com/Tlahey/git-manager/pull/147
* feat(launchpad): local WIP tab, PR snooze, and per-row quick actions by @Tlahey in https://github.com/Tlahey/git-manager/pull/145
* feat(launchpad): redesign the Issues view (repo-scoped, mine filter, infinite scroll, richer rows + actions) by @Tlahey in https://github.com/Tlahey/git-manager/pull/148
* feat: launchpad optimization + file-explorer  by @Tlahey in https://github.com/Tlahey/git-manager/pull/149
* feat(terminal): constrain terminal to commit list container and add close button by @Tlahey in https://github.com/Tlahey/git-manager/pull/150
* feat(desktop): add commit and stash tabs above message area in right panel by @Tlahey in https://github.com/Tlahey/git-manager/pull/151
* feat(desktop): prompt to stash when a checkout is blocked by local changes by @Tlahey in https://github.com/Tlahey/git-manager/pull/152
* fix(desktop): harden and repair the GitHub-style file display by @Tlahey in https://github.com/Tlahey/git-manager/pull/153
* test(desktop): stop rAF callbacks leaking between main entry tests by @Tlahey in https://github.com/Tlahey/git-manager/pull/154
* docs: archive the stale feature specs and refresh the project docs by @Tlahey in https://github.com/Tlahey/git-manager/pull/155
* feat(rebase): show where a paused rebase stands in the content view by @Tlahey in https://github.com/Tlahey/git-manager/pull/156
* fix(e2e): repair the five silently-broken feature files by @Tlahey in https://github.com/Tlahey/git-manager/pull/157
* feat(tabs): open an empty "New Tab" with ⌘T/Ctrl+T by @Tlahey in https://github.com/Tlahey/git-manager/pull/158
* feat(toolbar): flag conflicts against the branch's merge target by @Tlahey in https://github.com/Tlahey/git-manager/pull/159
* feat(dashboard): rework the home page into four repository sections by @Tlahey in https://github.com/Tlahey/git-manager/pull/160
* feat(ai): rework provider settings around Ollama + a generic OpenAI-compatible entry by @Tlahey in https://github.com/Tlahey/git-manager/pull/161
* fix(graph): stop a WIP connector from grafting a dotted start onto a merge link by @Tlahey in https://github.com/Tlahey/git-manager/pull/162
* feat(ai): explain a file, a commit, a branch or the work in progress by @Tlahey in https://github.com/Tlahey/git-manager/pull/163
* feat(ai): review a diff with an LLM, before committing or opening a PR by @Tlahey in https://github.com/Tlahey/git-manager/pull/164
* refactor(ai): size the commit explanation against the model, not a constant by @Tlahey in https://github.com/Tlahey/git-manager/pull/165
* fix(ai): size every prompt to the model's window, and isolate concurrent runs by @Tlahey in https://github.com/Tlahey/git-manager/pull/166
* feat(ai): verify the served context window, enforce the output reserve, rewrite commit messages by @Tlahey in https://github.com/Tlahey/git-manager/pull/167
* fix(ai): keep a reasoning model's deliberation out of the commit box by @Tlahey in https://github.com/Tlahey/git-manager/pull/168
* feat(ai): finalize AI commit batches — two-phase planning, a side panel, and git safety by @Tlahey in https://github.com/Tlahey/git-manager/pull/169
* feat(theme): add Glass, a translucent macOS-material theme by @Tlahey in https://github.com/Tlahey/git-manager/pull/170
* fix(graph): lay out commit columns top-to-bottom, and actually run the auto-fetch by @Tlahey in https://github.com/Tlahey/git-manager/pull/171
* feat(ai): archive a per-day briefing of what landed on the main branch by @Tlahey in https://github.com/Tlahey/git-manager/pull/172
* feat(ai): search history by asking a question about it by @Tlahey in https://github.com/Tlahey/git-manager/pull/173
* feat(desktop): rework the repository sidebar's left panel by @Tlahey in https://github.com/Tlahey/git-manager/pull/174
* feat(desktop): let a PR or issue checkbox be ticked while reading by @Tlahey in https://github.com/Tlahey/git-manager/pull/175
* feat(graph): scroll the graph column horizontally by @Tlahey in https://github.com/Tlahey/git-manager/pull/176
* fix(desktop): tell a merged PR from a closed one, and order the notification steps by @Tlahey in https://github.com/Tlahey/git-manager/pull/177
* fix(ui): stop the tooltip sliding into place, and make the animation classes actually emit CSS by @Tlahey in https://github.com/Tlahey/git-manager/pull/178
* feat: package health check tool, with dependency updates and an AI upgrade-risk assessment by @Tlahey in https://github.com/Tlahey/git-manager/pull/179
* fix(desktop): close a repo's panels when the tab changes by @Tlahey in https://github.com/Tlahey/git-manager/pull/180
* feat(docs): publish a documentation site generated from the e2e scenarios by @Tlahey in https://github.com/Tlahey/git-manager/pull/181
* fix(docs): keep the light/dark switch, and fix two light-mode contrast failures by @Tlahey in https://github.com/Tlahey/git-manager/pull/182
* fix(editor): theme the diff viewer and restore its connector ribbons by @Tlahey in https://github.com/Tlahey/git-manager/pull/183
* fix(editor): highlight the whitespace between consecutive changed words by @Tlahey in https://github.com/Tlahey/git-manager/pull/184
* feat(notifications): make native macOS notifications clickable and route back into the app by @Tlahey in https://github.com/Tlahey/git-manager/pull/185
* fix(rebase): stop stacking panels and duplicate controls in the conflict view by @Tlahey in https://github.com/Tlahey/git-manager/pull/186
* feat(ai): explain the git commands behind a user's actions by @Tlahey in https://github.com/Tlahey/git-manager/pull/187
* feat(theme): add an Ocean theme from the mascot's palette by @Tlahey in https://github.com/Tlahey/git-manager/pull/188
* fix(editor): Monaco syntax colors blocked by CSP + Ocean theme default for e2e by @Tlahey in https://github.com/Tlahey/git-manager/pull/190
* fix(e2e): add missing commit_message schema case to fake AI server by @Tlahey in https://github.com/Tlahey/git-manager/pull/196
* fix(notifications): stop dev-only test controls from rendering in non-development builds by @Tlahey in https://github.com/Tlahey/git-manager/pull/197
* docs: tag e2e scenarios for the doc site — all 7 sections by @Tlahey in https://github.com/Tlahey/git-manager/pull/191
* fix: unwrap AppError JSON into a readable message at the invoke() chokepoint by @Tlahey in https://github.com/Tlahey/git-manager/pull/198
* fix: set upstream tracking after pushing a brand-new local branch by @Tlahey in https://github.com/Tlahey/git-manager/pull/199
* docs: complete the doc site content plan (fixes #189) by @Tlahey in https://github.com/Tlahey/git-manager/pull/200
* docs: plan the remaining doc-site coverage (Launchpad, Settings, AI features, and more) by @Tlahey in https://github.com/Tlahey/git-manager/pull/201
* docs(e2e): New Tab page — recent repositories by @Tlahey in https://github.com/Tlahey/git-manager/pull/202
* fix(fixtures): give every commit a real-looking author, not "Test User" by @Tlahey in https://github.com/Tlahey/git-manager/pull/203
* docs(e2e): repository sidebar — search, solo mode, pinning by @Tlahey in https://github.com/Tlahey/git-manager/pull/204
* docs(e2e): Patch workflows — Create and Apply by @Tlahey in https://github.com/Tlahey/git-manager/pull/205
* feat(docs): image lightbox, docs CTA on the hero, install guide by @Tlahey in https://github.com/Tlahey/git-manager/pull/207
* feat: custom notification popover anchored under the macOS menu bar by @Tlahey in https://github.com/Tlahey/git-manager/pull/206
* fix: pull hang/error clarity, bisect panel duplication, and docs lightbox by @Tlahey in https://github.com/Tlahey/git-manager/pull/208
* docs(e2e): cover the offline package health check by @Tlahey in https://github.com/Tlahey/git-manager/pull/209
* docs(e2e): cover recomposing a commit's message with the LLM by @Tlahey in https://github.com/Tlahey/git-manager/pull/213
* docs(e2e): cover the four Explain (LLM) entry points by @Tlahey in https://github.com/Tlahey/git-manager/pull/211
* docs(e2e): cover AI code review of working changes and a branch by @Tlahey in https://github.com/Tlahey/git-manager/pull/212
* docs(e2e): cover drafting a PR description with the LLM by @Tlahey in https://github.com/Tlahey/git-manager/pull/214
* docs(e2e): cover semantic commit search by @Tlahey in https://github.com/Tlahey/git-manager/pull/215
* docs(e2e): cover the Action Journal's plain-English explanations by @Tlahey in https://github.com/Tlahey/git-manager/pull/216
* docs(e2e): cover the dashboard, and stop calling it "the launchpad" by @Tlahey in https://github.com/Tlahey/git-manager/pull/217
* docs(e2e): cover asking your own daily-summary archive a question by @Tlahey in https://github.com/Tlahey/git-manager/pull/218
* docs(e2e): cover the achievement toast and the Rewards tab by @Tlahey in https://github.com/Tlahey/git-manager/pull/219
* fix: stop the Launchpad crashing with no GitHub account connected by @Tlahey in https://github.com/Tlahey/git-manager/pull/220
* docs(launchpad): add doc page for Your pull requests by @Tlahey in https://github.com/Tlahey/git-manager/pull/221
* docs(launchpad): add doc page for Follow, snooze & save views by @Tlahey in https://github.com/Tlahey/git-manager/pull/222
* docs(launchpad): add doc pages for issue triage and contribution activity by @Tlahey in https://github.com/Tlahey/git-manager/pull/223
* docs(settings): tag SSH keygen and GitHub OAuth scenarios for the doc site by @Tlahey in https://github.com/Tlahey/git-manager/pull/224
* docs(settings): add doc coverage for search, support, and changelog by @Tlahey in https://github.com/Tlahey/git-manager/pull/225
* docs(settings): add doc page for repository-specific settings by @Tlahey in https://github.com/Tlahey/git-manager/pull/226
* docs(activity-log): add doc page for the Activity log by @Tlahey in https://github.com/Tlahey/git-manager/pull/227
* fix(rewards): translate achievements catalog and rank names by @Tlahey in https://github.com/Tlahey/git-manager/pull/228
* fix(footer): translate keyboard shortcuts dialog and rewards badge by @Tlahey in https://github.com/Tlahey/git-manager/pull/229
* fix(settings): translate GitLab and Bitbucket integration panels by @Tlahey in https://github.com/Tlahey/git-manager/pull/230
* test(settings): migrate SettingsPage.test.tsx off the i18n key-passthrough mock by @Tlahey in https://github.com/Tlahey/git-manager/pull/231
* fix(e2e): stop waiting for opacity-0 rewards checkbox to be displayed by @Tlahey in https://github.com/Tlahey/git-manager/pull/232
* docs: add per-page feedback link to a GitHub issue by @Tlahey in https://github.com/Tlahey/git-manager/pull/233
* docs: make the documentation match the code, and remove what cannot by @Tlahey in https://github.com/Tlahey/git-manager/pull/238
* docs(readme): use the documentation site's screenshots by @Tlahey in https://github.com/Tlahey/git-manager/pull/239
* feat(notifications): extract the notch card into @git-manager/notch and put live work on it by @Tlahey in https://github.com/Tlahey/git-manager/pull/240
* feat(ui): add cursor-pointer to interactive elements across the app by @Tlahey in https://github.com/Tlahey/git-manager/pull/243
* fix(notifications): close the pre-push bypass, and make the notch card behave by @Tlahey in https://github.com/Tlahey/git-manager/pull/242
* fix(notch): stop NotchWindow's tests racing real animation frames by @Tlahey in https://github.com/Tlahey/git-manager/pull/255
* chore(settings): drop dead get_settings/update_settings wrappers by @Tlahey in https://github.com/Tlahey/git-manager/pull/244
* feat(graph): copy link to branch for any pushed branch by @Tlahey in https://github.com/Tlahey/git-manager/pull/245
* feat(graph): add Copy commit SHA to the tag menu by @Tlahey in https://github.com/Tlahey/git-manager/pull/247
* feat(branch): implement rename_branch backend command by @Tlahey in https://github.com/Tlahey/git-manager/pull/248
* feat(branch): implement Set upstream by @Tlahey in https://github.com/Tlahey/git-manager/pull/253
* feat(graph): add a context menu for the CONFLICT row by @Tlahey in https://github.com/Tlahey/git-manager/pull/246
* feat(graph): add a context menu for other-worktree WIP rows by @Tlahey in https://github.com/Tlahey/git-manager/pull/249
* feat(graph): merge-commit context-menu actions (revert -m, compare vs parent) by @Tlahey in https://github.com/Tlahey/git-manager/pull/250
* feat(diff): compare two arbitrary branches by @Tlahey in https://github.com/Tlahey/git-manager/pull/251
* feat(branch): support remote branch deletion with confirmation by @Tlahey in https://github.com/Tlahey/git-manager/pull/254
* feat(tabs): view tabs within a repo (graph / terminal / settings) by @Tlahey in https://github.com/Tlahey/git-manager/pull/252
* docs: add guidance for reporting analysis findings as GitHub issues by @Tlahey in https://github.com/Tlahey/git-manager/pull/256
* fix(merge-editor): pin collapsed-fragment banner to viewport and align its wave color by @Tlahey in https://github.com/Tlahey/git-manager/pull/257
* Restyle merge-conflict toolbar and simplify the rebase merge window by @Tlahey in https://github.com/Tlahey/git-manager/pull/258
* feat(github): open GitHub in the browser when dropping media on a PR/issue by @Tlahey in https://github.com/Tlahey/git-manager/pull/260
* feat(theme): lock built-in themes behind rewards, default to System by @Tlahey in https://github.com/Tlahey/git-manager/pull/261
* refactor: god-file retrofit (git.api.ts, GitGraph.tsx, RepositorySidebar.tsx) + remove the per-repo view tabs by @Tlahey in https://github.com/Tlahey/git-manager/pull/262
* test(e2e): isolate the suite's app state, and cut a full run from 62 to 18 minutes by @Tlahey in https://github.com/Tlahey/git-manager/pull/263
* docs(e2e): commit the run report so the README's link resolves by @Tlahey in https://github.com/Tlahey/git-manager/pull/264
* fix(e2e): stabilise the suite — secondary windows, cross-run leaks, and the blank-page crash by @Tlahey in https://github.com/Tlahey/git-manager/pull/265
* docs(e2e): map the uncovered app surface in COVERAGE.md, pointed at from REPORT.md by @Tlahey in https://github.com/Tlahey/git-manager/pull/266
* docs: interface chrome tour with zone-cropped captures + journey-ordered sidebar by @Tlahey in https://github.com/Tlahey/git-manager/pull/269
* Undo gestures, ref dialogs, and a keyboard route for branch/tag actions by @Tlahey in https://github.com/Tlahey/git-manager/pull/274
* e2e: close the last coverage gaps — COVERAGE.md has no unwritten rows left by @Tlahey in https://github.com/Tlahey/git-manager/pull/275
* e2e: unblock the interactive rebase editor and multi-commit patch — both 'blocked' rows were stale by @Tlahey in https://github.com/Tlahey/git-manager/pull/276
* docs: restructure the documentation and close the biggest coverage gaps by @Tlahey in https://github.com/Tlahey/git-manager/pull/278
* fix(commit): avoid panic in get_file_raw_contents on missing HEAD tree by @Tlahey in https://github.com/Tlahey/git-manager/pull/291
* test(git-api): cover gitApiShared undo/redo kernel by @Tlahey in https://github.com/Tlahey/git-manager/pull/292
* test(sidebar): cover useSidebarBranchMenu's destructive git operations by @Tlahey in https://github.com/Tlahey/git-manager/pull/296
* fix(github): stop unconditionally logging OAuth codes and profile data by @Tlahey in https://github.com/Tlahey/git-manager/pull/293
* fix(commit): map errors to AppError instead of raw strings by @Tlahey in https://github.com/Tlahey/git-manager/pull/294
* refactor(api): split github.api.ts into domain files by @Tlahey in https://github.com/Tlahey/git-manager/pull/295
* test(services): cover autosquash grouping, conflict, and stash logic by @Tlahey in https://github.com/Tlahey/git-manager/pull/297
* docs: close the remaining documentation coverage gaps by @Tlahey in https://github.com/Tlahey/git-manager/pull/301
* test(gitlab): cover useGitlabDeviceFlow by @Tlahey in https://github.com/Tlahey/git-manager/pull/299
* fix(services): reuse utils::short_oid() instead of hand-rolled truncation by @Tlahey in https://github.com/Tlahey/git-manager/pull/300
* test(stores): cover savedFilters clamping and rename semantics by @Tlahey in https://github.com/Tlahey/git-manager/pull/302
* refactor(lib): add shared shortOid() helper and migrate duplicated truncation by @Tlahey in https://github.com/Tlahey/git-manager/pull/303
* fix(commands): map remaining stringly-typed errors to AppError by @Tlahey in https://github.com/Tlahey/git-manager/pull/304
* chore(tooling): enforce Conventional Commits with commitlint and husky by @Tlahey in https://github.com/Tlahey/git-manager/pull/305
* feat(rewards): celebrate an unlock in the notch, with confetti by @Tlahey in https://github.com/Tlahey/git-manager/pull/306
* feat(board): Kanban boards with rich cards, sprints and GitHub issue tracking by @Tlahey in https://github.com/Tlahey/git-manager/pull/307
* feat(board): finish the #259 UI, and regroup the feature under src/features by @Tlahey in https://github.com/Tlahey/git-manager/pull/308
* fix(board): close sprints for real, and stop cards vanishing on a column or board change by @Tlahey in https://github.com/Tlahey/git-manager/pull/309
* build(tooling): expand the oxlint ruleset, enable type-aware linting, and clear the fallout by @Tlahey in https://github.com/Tlahey/git-manager/pull/310
* feat(graph): center clicked commit's avatar when the graph column is scrolled by @Tlahey in https://github.com/Tlahey/git-manager/pull/311
* feat(graph): reorder and combine commits by dragging them in the graph by @Tlahey in https://github.com/Tlahey/git-manager/pull/312
* feat(timeline): preview the state the repository would have, not the current one by @Tlahey in https://github.com/Tlahey/git-manager/pull/314
* perf(diff): make the diff and merge editors scale with the viewport, not the file by @Tlahey in https://github.com/Tlahey/git-manager/pull/315
* fix(markdown): highlight every fenced language and fix code-block copy/inline bugs by @Tlahey in https://github.com/Tlahey/git-manager/pull/316
* feat(mascot): rebuild the rig from per-element art, animate it on the splashscreen by @Tlahey in https://github.com/Tlahey/git-manager/pull/317


**Full Changelog**: https://github.com/Tlahey/git-manager/compare/v0.1.0...v0.2.0

## [0.1.0] - 2026-06-30

Initial release.

### Added

- Repository browsing: commit graph, branches, tags, stashes, submodules
- Stage/unstage/commit/discard workflow with a 3-way merge conflict editor (drag-and-drop interactive rebase planning included)
- Fixup/autosquash support with pre-commit conflict warnings
- Undo/redo across most git operations
- GitHub integration: OAuth device flow, pull request browsing
- Local AI-assisted commit messages (Ollama and OpenAI-compatible providers)
- Achievements & rewards system with unlockable cosmetic themes
- English/French localization
