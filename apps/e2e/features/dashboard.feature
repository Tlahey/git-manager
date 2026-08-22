@dashboard
Feature: Your projects at a glance

  As a user working across several repositories
  I want one place that lists them all, with the ones I care about pinned to the top
  So that I don't have to remember which folder each one lives in

  Every repository you've opened or discovered shows up here, grouped into sections — open tabs,
  favorites, recently used, everything else — each as a row with its branch and working-tree state
  at a glance. A repo's own README lives in the same right-hand slot the AI daily briefing uses
  (covered on its own page), so a card can be read without opening the repository itself.

  @doc @screenshots
  Scenario: Pinning a project keeps it at the top of the dashboard
    Starring a repository's row adds it to its own Favorites section, ahead of Recent and All —
    the fastest way back to the handful of repositories you actually work in day to day, out of
    everything the dashboard otherwise lists. Its README opens in the same right-hand panel a
    repository's AI daily briefing would use.
    Given the app language is English
    And the "showcase" and "feature-branches" fixture repositories are listed in the dashboard
    When I open the dashboard
    And I pin the "showcase" project
    Then the "showcase" project is in the favorites section
    When I open the "showcase" project's README
    Then the README panel is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard"

  @doc @screenshots
  Scenario: Reading a project's README without opening it
    The README opens in the dashboard's right-hand panel, rendered, so a
    project can be identified — or its setup steps followed — without opening
    the repository at all. The toggle in the panel header switches between
    the rendered view and the raw Markdown source, for the times you want to
    see exactly what the file says.
    Given the app language is English
    And AI features are turned off
    And the "showcase" and "feature-branches" fixture repositories are listed in the dashboard
    When I open the dashboard
    And I open the "showcase" project's README
    Then the README panel is shown
    And the README panel shows "Showcase"
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard-readme"
    When I switch the README panel to its source view
    Then the README source shows "# Showcase"

  @doc @screenshots
  Scenario: Filtering, folding and hiding sections on the dashboard
    Filtering by name narrows every section at once, live. Collapse and Expand fold every
    section's rows away or back in one click, for the times only the headers and their counts
    matter. Hiding a section from its own "..." menu takes it off the dashboard entirely — the
    button that appears next to Collapse from that moment on is the only way back, one section or
    all of them at once.
    Given the app language is English
    And AI features are turned off
    And the "showcase" and "feature-branches" fixture repositories are listed in the dashboard
    When I open the dashboard
    And I filter the dashboard for "showcase"
    Then the "showcase" project is shown on the dashboard
    And the "feature-branches" project is not shown on the dashboard
    When I clear the dashboard filter
    And I collapse all dashboard sections
    Then the "showcase" project is not shown on the dashboard
    When I expand all dashboard sections
    Then the "showcase" project is shown on the dashboard
    When I hide the "all" dashboard section
    Then the "all" dashboard section is not shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard-sections"
    When I restore the "all" dashboard section from the hidden sections menu
    Then the "all" dashboard section is shown
    And no error notification is displayed

  @doc @screenshots
  Scenario: Each row reports its branch and what is waiting in it
    Every row carries the state of its repository without opening it: the
    branch it is on, and counters for what is staged, changed but unstaged,
    untracked or conflicted — so a glance down the list says which projects
    have work left in them. A repository with nothing pending collapses to a
    single check mark, keeping a tidy list quiet.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" and "feature-branches" fixture repositories are listed in the dashboard
    When I open the dashboard
    Then the "stash-stack" row is on branch "main"
    And the "stash-stack" row reports 1 staged and 1 untracked change
    And the "feature-branches" row reports a clean working tree
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard-status"
