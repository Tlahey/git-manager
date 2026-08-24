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
  Scenario: Color-coding a section for a quicker scan down the dashboard
    Each section's "..." menu ends in a row of colour swatches — a purely visual tag for picking a
    section out at a glance on a dashboard with several of them, unrelated to what it actually
    contains. Picking one colours the section's header immediately; the crossed-out circle clears
    it back to the neutral default.
    Given the app language is English
    And AI features are turned off
    And the "showcase" and "feature-branches" fixture repositories are listed in the dashboard
    When I open the dashboard
    And I color the "all" dashboard section "emerald"
    Then the "all" dashboard section is colored "emerald"
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard-color"
    When I color the "all" dashboard section "none"
    Then the "all" dashboard section is not colored

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

  @doc @screenshots
  Scenario: Fetching or pulling several repositories at once from a section
    Checking a row's box turns every action in the section's header into a bulk one — the "N
    selected" count next to them is what says so, and every other row still targets the whole
    section when nothing is checked. Fetch and Pull work the same way here as they do on the
    toolbar of an open repository, just run over every checked repository in turn: one unreachable
    remote never stops the others.
    Given the app language is English
    And AI features are turned off
    And the "remote-behind" and "remote-ahead" fixture repositories are pinned on the dashboard
    When I open the dashboard
    And I select the "remote-behind" and "remote-ahead" projects on the dashboard
    Then the favorites section reports 2 selected
    When I pull the favorites section with the "fast-forward-if-possible" strategy
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard-bulk-pull"
    Then the "remote-behind" project's HEAD commit subject contains "teammate's follow-up commit"
    And no error notification is displayed

  Scenario: Scanning a folder discovers the repositories inside it
    "Scan folder" is the other way onto the dashboard besides opening or cloning one repository at
    a time: pick a parent folder and every repository it contains — up to 4 levels deep — is added
    at once, exactly as if each had been opened individually.
    Given the app language is English
    And the "stash-stack" and "feature-branches" fixture repositories exist on disk
    And no repositories are known to the dashboard
    When I open the dashboard
    And I click the scan-repos button
    And I choose "/tmp/git-manager-fixtures" in the folder picker
    Then the "stash-stack" project is shown on the dashboard
    And the "feature-branches" project is shown on the dashboard

  @doc @screenshots
  Scenario: The dashboard before any repository has been opened
    Before you've opened or scanned for a single repository, the dashboard is one screen rather
    than four empty sections — a short explanation and the same "Open repository" action the
    toolbar itself offers, with nothing to search, collapse or filter yet.
    Given the app language is English
    And AI features are turned off
    And no repositories are known to the dashboard
    When I open the dashboard
    Then the dashboard shows its empty state
    And the interface has settled
    And a full-window screenshot is saved as "doc-dashboard-empty"
    # Restores a populated dashboard: the shared app instance carries this state into whatever
    # scenario — in this file or the next spec file the run reaches — opens the dashboard next
    # without seeding its own repositories first.
    When the "showcase" and "feature-branches" fixture repositories are listed in the dashboard
