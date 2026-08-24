@stash
Feature: Stash list
  As a user with stashed changes
  I want to see my stashes listed in the sidebar
  So that I can find and restore them

  Stashes aren't tucked away in a separate panel — they're just another
  entry in the sidebar, listed alongside your branches and tags, with their
  own actions (apply, pop, drop) available through the command palette.

  Background:
    Given the "stash-stack" fixture repository is opened

  @doc @screenshots
  Scenario: The sidebar lists the stashed changes
    Every stash you've pushed shows up in its own sidebar section, most
    recent first — no separate "stash panel" to open, no memorising
    indices. Selecting one lets you run its actions from the command
    palette.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I expand the "stashes" sidebar section
    And the interface has settled
    Then the sidebar lists 2 stashes
    And a full-window screenshot is saved as "doc-stash-sidebar"

  @doc @screenshots
  Scenario: Stashing puts your work aside and clears the tree
    The toolbar's Stash button takes everything you have in progress —
    including untracked files — and parks it, leaving a clean working tree to
    switch branches or pull. Whatever you typed in the graph's work-in-progress
    row becomes the stash's own message, so the pile stays readable; leave it
    empty and it is named after the branch you were on.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I name the work in progress "wip: half-finished config work"
    And I stash the working changes
    Then the repository has 3 stashes
    And the newest stash is named "wip: half-finished config work"
    And the working tree is clean
    And the interface has settled
    And a full-window screenshot is saved as "doc-stash-created"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Naming a stash and choosing whether to include untracked files
    Selecting the working tree opens the same panel a commit would, with a Stash tab next to it:
    an optional message, and a checkbox for whether untracked files come along — checked by
    default, since that's what the toolbar's own Stash button always does, but visible and yours
    to turn off here rather than a silent default you never see.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I switch the staging panel to the stash tab
    And I type "wip: keep tracked changes only" into the stash message field
    And I uncheck the include-untracked-files option
    And I submit the stash form
    Then the repository has 3 stashes
    And the newest stash is named "wip: keep tracked changes only"
    And the file "IN_PROGRESS.md" is untracked in the working tree
    And the interface has settled
    And a full-window screenshot is saved as "doc-stash-options"

  @doc @screenshots
  Scenario: Renaming a stash rewrites its message
    A stash's message is editable the same way a commit's own is: select it, click the message to
    turn it into an input, and confirm. Nothing else about the stash changes — it stays the same
    entry at the same position in the stack, just under a name that says why you kept it.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I expand the "stashes" sidebar section
    And I rename the newest stash to "reviewed: keep for later"
    Then the newest stash is named "reviewed: keep for later"
    And the repository has 2 stashes
    And the interface has settled
    And a full-window screenshot is saved as "doc-stash-renamed"

  Scenario: Undoing a stash pop restores the stash
    Popping a stash from the command palette goes through the same undo history as any other
    action: ⌘Z brings the stash right back, at the same message and the same changes it had before
    it was applied and removed.
    Given the app language is English
    And the "stash-stack" fixture repository is opened
    Then the repository has 2 stashes
    # The fixture leaves a staged edit to config.yml on top of both stashes (deliberately, to
    # cover stash-vs-working-tree conflicts elsewhere) — the newest stash touches the same file at
    # the same position, so popping it straight onto that leftover would conflict rather than
    # apply. Discarding it first restores the exact tree the stash was taken against.
    When I select the working-tree changes in the graph
    And I discard the changes to "config.yml"
    And I select the "stash@{0}" commit in the graph
    And I open the command palette
    And I run the command palette action "stash-pop"
    Then the repository has 1 stash
    When I undo the last action
    Then the repository has 2 stashes

  Scenario: Undoing a stash drop restores the stash
    Dropping a stash is undoable too — the deleted stash comes back exactly as it was, without
    needing a reflog to find it.
    Given the app language is English
    And the "stash-stack" fixture repository is opened
    Then the repository has 2 stashes
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    And I run the command palette action "stash-drop"
    Then the repository has 1 stash
    When I undo the last action
    Then the repository has 2 stashes
