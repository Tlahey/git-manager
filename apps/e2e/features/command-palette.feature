@palette
Feature: Command palette (⌘K)
  As a user
  I want a keyboard-driven command palette
  So that I can run global and commit-scoped actions without the native menus

  ⌘K opens the command palette from anywhere in the app — a single,
  keyboard-driven list of every action you could run: global commands like
  jumping to a settings section, and, once a commit is selected in the
  graph, that commit's own scoped actions (reset, revert, branch, tag,
  cherry-pick, stash apply/pop/drop) filtered to just what makes sense for
  it.

  Background:
    Given the "rollback-history" fixture repository is opened

  Scenario: Opening a settings section from the palette
    When I open the command palette
    And I run the command palette action "settings-ui_customization"
    Then the settings screen is shown

  @doc @screenshots
  Scenario: Resetting to an earlier commit from the palette
    Selecting a commit in the graph, then opening the palette, offers that
    commit's own actions — reset, revert, branch, tag, cherry-pick — scoped
    to exactly that commit rather than a generic list. Running reset from
    here opens the same confirmation dialog the toolbar's Reset button
    would, so picking the mixed, soft or hard mode isn't skipped just
    because you got there by keyboard.
    Given the app language is English
    And AI features are turned off
    And the "rollback-history" fixture repository is opened
    When I select the "HEAD~2" commit in the graph
    And I open the command palette
    And the interface has settled
    Then the command palette shows commit actions for "HEAD~2"
    And a full-window screenshot is saved as "doc-command-palette"
    When I run the command palette action "commit-reset-mixed"
    Then the reset dialog is shown
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 2"

  Scenario: Soft-resetting to an earlier commit keeps the change staged
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-reset-soft"
    Then the reset dialog is shown
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 3"
    And the working tree has staged changes

  Scenario: Hard-resetting requires typing RESET to confirm
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-reset-hard"
    Then the reset dialog is shown
    And the reset confirm button is disabled
    When I type "RESET" into the reset confirmation input
    Then the reset confirm button is enabled
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 3"
    And the working tree is clean

  Scenario: Reverting the last commit from the palette
    When I open the command palette
    Then the command palette shows commit actions for "HEAD"
    When I run the command palette action "commit-revert"
    Then the revert dialog is shown
    When I confirm the revert
    Then the repository HEAD commit subject contains "chore: bump counter to 4"

  Scenario: Creating a branch from an earlier commit via the palette
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-branch"
    Then the create branch dialog is shown
    When I enter the branch name "feature/from-palette"
    And I confirm the branch creation
    Then the branch "feature/from-palette" points at the commit "chore: bump counter to 3"

  Scenario: Creating a tag from an earlier commit via the palette
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-tag"
    Then the tag name input is shown
    When I enter the tag name "v-from-palette"
    And I confirm the tag creation
    Then the tag "v-from-palette" points at the commit "chore: bump counter to 3"
    And the tag "v-from-palette" is shown as a ref in the graph

  Scenario: Creating an annotated tag from an earlier commit via the palette
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-tag-annotated"
    Then the tag name input is shown
    When I enter the tag name "v-annotated-from-palette"
    And I confirm the tag creation
    Then the tag "v-annotated-from-palette" points at the commit "chore: bump counter to 3"
    And the tag "v-annotated-from-palette" is annotated

  Scenario: Cherry-picking a commit from another branch via the palette
    Given the "feature-branches" fixture repository is opened
    When I select the "feature/login" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "feature/login"
    When I run the command palette action "commit-cherry-pick"
    Then the commit "feat: add login screen" is reachable from "main"

  Scenario: Dropping a stash via the palette
    Given the "stash-stack" fixture repository is opened
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    When I run the command palette action "stash-drop"
    Then the repository has 1 stash

  @doc @screenshots
  Scenario: Applying a stash via the palette keeps it but restores its changes
    There's no separate "stash panel" — every stash action runs through the
    command palette, on whichever stash you've selected in the graph.
    Selecting a stash and opening the palette offers Apply, Pop and Drop
    together: Apply restores its changes to your working tree without
    removing the stash itself, so you can reuse it later; Pop does the same
    but removes it once applied, and Drop discards it outright.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    And the working tree starts clean
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    And the interface has settled
    Then the command palette is shown
    And a full-window screenshot is saved as "doc-stash-palette"
    When I run the command palette action "stash-apply"
    Then the repository has 2 stashes
    And the file "notes.txt" exists in the working tree

  Scenario: Popping a stash via the palette removes it and restores its changes
    Given the "stash-stack" fixture repository is opened
    And the working tree starts clean
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    When I run the command palette action "stash-pop"
    Then the repository has 1 stash
    And the file "notes.txt" exists in the working tree
