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
