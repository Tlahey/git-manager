@undo @redo
Feature: Undo and redo a branch checkout
  As a user who switched branches
  I want Cmd+Z / Cmd+Shift+Z to undo and redo the checkout
  So that I can move HEAD back and forth without fear

  Checking out a branch or resetting HEAD isn't a one-way door: both go on
  an undo stack you can step back and forward through with the same
  shortcuts you'd use in any editor.

  Background:
    Given the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Undoing a checkout returns to the previous branch and redo re-applies it
    Actions like checking out a branch or resetting HEAD go on the same
    undo stack you'd expect from any editor: ⌘Z reverts the last one, and
    ⌘⇧Z re-applies it if you change your mind — no separate "undo this
    checkout" button to hunt for, and no limit to one step back. The branch
    indicator (or the HEAD commit, for a reset) reflects every step
    immediately.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    Then the branch indicator reads "main"
    When I check out the "feature/login" branch
    Then the branch indicator reads "feature/login"
    When I undo the last action
    Then the branch indicator reads "main"
    When I redo the last undone action
    And the interface has settled
    Then the branch indicator reads "feature/login"
    And a full-window screenshot is saved as "doc-undo-redo"

  @doc @screenshots
  Scenario: Scrubbing the timeline previews an earlier state before committing to it
    The clock icon next to Undo/Redo opens a scrubber over the whole history of undoable actions,
    not just the last one: dragging it back — or picking a step from the list beside it — previews
    that point read-only, with a hint saying exactly what Validate would apply from here. Nothing
    in the repository actually changes until that click.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    Then the branch indicator reads "main"
    When I check out the "feature/login" branch
    Then the branch indicator reads "feature/login"
    When I open the undo timeline
    Then the timeline scrubber is shown
    When I scrub the timeline back one step
    Then the timeline hint reads "undo 1"
    And the interface has settled
    And a full-window screenshot is saved as "doc-timeline-scrubber"
    When I validate the timeline
    Then the branch indicator reads "main"

  Scenario: Undoing a reset restores HEAD and redo re-applies it
    Given the "rollback-history" fixture repository is opened
    When I select the "HEAD~2" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-reset-mixed"
    Then the reset dialog is shown
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 2"
    And no error notification is displayed
    When I undo the last action
    Then the repository HEAD commit subject is "chore: bump counter to 4"
    When I redo the last undone action
    Then the repository HEAD commit subject is "chore: bump counter to 2"

  # Undo covers more than the checkout and reset above, and a gesture that performed several git
  # operations has to come back as one: "create branch here" creates the ref *and* checks it out,
  # so a single ⌘Z has to take both back. Before they were correlated, undo tried to delete a
  # branch git had just made HEAD, was refused, and failed silently.
  Scenario: Undoing a branch creation takes back the checkout with it
    Given the "rollback-history" fixture repository is opened
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-branch"
    Then the create branch dialog is shown
    When I enter the branch name "feature/undo-me"
    And I confirm the branch creation
    Then the branch "feature/undo-me" exists
    And the branch indicator reads "feature/undo-me"
    When I undo the last action
    Then the branch "feature/undo-me" no longer exists
    And the branch indicator reads "main"
    And no error notification is displayed
    When I redo the last undone action
    Then the branch "feature/undo-me" exists
    And the branch indicator reads "feature/undo-me"
