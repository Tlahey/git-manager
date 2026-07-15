# Changelog

Notable changes to git-manager, release by release. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This file is bundled into the app and rendered
on Settings → Changelog (and via the version badge in the footer).

## [Unreleased]

_Every merged PR since v0.1.0, in GitHub's own "generate release notes" format — this is what
`prepare-release.yml` will regenerate automatically the next time a release is cut._

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

**Full Changelog**: https://github.com/Tlahey/git-manager/compare/v0.1.0...HEAD

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
