@branches
Feature: Renaming a branch
  As a user who picked the wrong branch name
  I want to rename a local branch
  So that I can fix it without deleting and recreating it

  Branch rename is only reachable from a native macOS context menu (the
  graph's commit menu and the sidebar's branch menu), which WebDriver
  cannot drive at all — see apps/e2e/README.md and tag-menu.steps.ts's
  note on native menus. These scenarios instead dispatch straight into the
  `pendingGraphAction` store bridge (`repoUI.store.ts`) that the ⌘K
  command palette also uses for its own dialog-based actions (reset,
  revert, create-branch, tag — see command-palette.steps.ts), which
  `GitGraph.tsx` forwards into the exact same `RenameBranchDialog` the
  native menu would open. From there everything is real: the confirm
  click, the `rename_branch` Tauri command, and the branch actually
  moving on disk.

  Background:
    Given the "feature-branches" fixture repository is opened

  Scenario: Renaming a branch updates it on disk
    When I select the "HEAD" commit in the graph
    And I open the rename dialog for the branch "feature/login" via the store bridge
    Then the rename branch dialog is shown
    When I set the rename branch name to "feature/authentication"
    And I confirm the branch rename
    Then the branch "feature/authentication" exists
    And the branch "feature/login" no longer exists

  Scenario: Renaming the protected main branch is rejected
    When I select the "HEAD" commit in the graph
    And I open the rename dialog for the branch "main" via the store bridge
    Then the rename branch dialog is shown
    When I set the rename branch name to "renamed-main"
    And I confirm the branch rename
    Then an inline rename error is shown
    And the branch "main" exists
    And the branch "renamed-main" no longer exists
