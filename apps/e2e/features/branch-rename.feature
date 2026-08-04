# How these scenarios reach the dialog, which is harness detail rather than anything a reader of
# the documentation needs: branch rename is only offered from a native macOS context menu (the
# graph's commit menu and the sidebar's branch menu), which WebDriver cannot drive at all — see
# apps/e2e/README.md and tag-menu.steps.ts's note on native menus. So these dispatch straight into
# the `pendingGraphAction` store bridge (`repoUI.store.ts`) that the ⌘K command palette also uses
# for its own dialog-based actions (reset, revert, create-branch, tag — see
# command-palette.steps.ts), which `GitGraph.tsx` forwards into the exact same
# `RenameBranchDialog` the native menu would open. From there everything is real: the confirm
# click, the `rename_branch` Tauri command, and the branch actually moving on disk.
@branches
Feature: Renaming a branch
  As a user who picked the wrong branch name
  I want to rename a local branch
  So that I can fix it without deleting and recreating it

  A branch name is a label on a commit, so renaming one costs nothing: no commit
  is rewritten, nothing is recreated, and the work stays exactly where it was.
  Right-click a branch — in the graph or in the sidebar — and Rename opens a
  dialog with the current name already in it.

  What moves is your **local** branch. A branch you have already pushed keeps its
  old name on the remote until you push the new one and delete the old one there;
  renaming here never reaches out to a server.

  Background:
    Given the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Renaming a branch updates it on disk
    The dialog arrives pre-filled with the current name; type the new one and
    confirm, and the branch has moved by the time it closes — its commits, and
    the remote it tracks, follow it. The one branch that refuses is a protected
    one (main, by default): the dialog tells you so inline instead of letting the
    rename land.
    Given the app language is English
    When I select the "HEAD" commit in the graph
    And I open the rename dialog for the branch "feature/login"
    Then the rename branch dialog is shown
    When I set the rename branch name to "feature/authentication"
    And the interface has settled
    And a full-window screenshot is saved as "doc-branch-rename"
    When I confirm the branch rename
    Then the branch "feature/authentication" exists
    And the branch "feature/login" no longer exists
    And no error notification is displayed

  Scenario: Renaming the protected main branch is rejected
    When I select the "HEAD" commit in the graph
    And I open the rename dialog for the branch "main"
    Then the rename branch dialog is shown
    When I set the rename branch name to "renamed-main"
    And I confirm the branch rename
    Then an inline rename error is shown
    And the branch "main" exists
    And the branch "renamed-main" no longer exists
