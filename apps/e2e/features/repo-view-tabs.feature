@repoviews
Feature: Repo tab views — Graph, Terminal, Settings
  As a user working inside one repository
  I want to switch that repo tab between its graph, an integrated terminal, and settings
  So that I can reach common side tasks without opening a new window or leaving the tab

  Every open repository tab now carries its own strip of view tabs, right under the toolbar:
  Graph (the commit history — the default view), Terminal (the same integrated terminal the
  app already has, shown full height instead of docked under the graph), and Settings (the
  app's one Settings page, embedded right in the tab instead of taking over the window). Only
  one view is mounted at a time, and each repository tab remembers its own selection
  independently of the others.

  Background:
    Given the "feature-branches" fixture repository is opened

  Scenario: The graph view is shown by default
    Then the "graph" view tab is selected
    And the graph view is shown

  @doc @screenshots
  Scenario: Switching a repo tab between Graph, Terminal, and Settings
    A small strip of tabs sits right under the toolbar for every open repository: Graph,
    Terminal, and Settings. Clicking one swaps the whole content area below it — the commit
    graph and sidebar, the integrated terminal, or the app's Settings page embedded right in
    the tab — without opening a new window or leaving the repository you're in.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    When I click the "terminal" view tab
    Then the terminal view is shown
    And the graph view is no longer shown
    When I click the "settings" view tab
    Then the settings view is shown
    And the terminal view is no longer shown
    When I click the "graph" view tab
    And the interface has settled
    Then the graph view is shown
    And a full-window screenshot is saved as "doc-repo-view-tabs"

  Scenario: A reload resets a repo tab back to the graph view
    When I click the "terminal" view tab
    Then the "terminal" view tab is selected
    When I reload the application
    Then the "graph" view tab is selected
    And the graph view is shown
