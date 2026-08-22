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
