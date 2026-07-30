@sidebar
Feature: The repository sidebar

  As a user with more branches than fit on screen at once
  I want to search and pin from the sidebar
  So that I can find and keep track of the ones I actually use

  Background:
    Given the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Searching the sidebar filters and can solo a branch
    The search box at the top of the sidebar filters the whole tree live —
    branches, tags, stashes, worktrees — as you type, with a running count
    of what matched. Solo mode (the focus icon next to it) is a second,
    independent way to narrow things down: once enabled, each branch gets
    its own toggle to show or hide it in the graph, so you can look at just
    the one or two lines of history you care about right now.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    When I search the sidebar for "login"
    Then the sidebar filter shows "1 / 2 results"
    When the interface has settled
    Then a full-window screenshot is saved as "doc-sidebar-search"
    When I clear the sidebar search
    Then the sidebar filter is hidden
    When I enable solo mode
    Then the solo strip shows "1 branch soloed"
    When I clear solo mode
    Then the solo strip is hidden

  @doc @screenshots
  Scenario: Pinning a branch keeps it pinned across a reload
    Pinning a branch (the pin icon on hover, or always visible once pinned)
    moves it to its own group at the top of the Local section, ahead of
    everything else — handy once a repository has more branches than fit
    on screen. The pin is remembered per repository and survives closing
    and reopening the app.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    When I expand the "local" sidebar section
    And I pin the "feature/login" branch
    Then the "feature/login" branch is pinned
    And a full-window screenshot is saved as "doc-sidebar-pin"
    When I reload the application
    And the interface has settled
    And I expand the "local" sidebar section
    Then the "feature/login" branch is pinned
