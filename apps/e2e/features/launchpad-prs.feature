@launchpad
Feature: Your pull requests

  As a developer working across several repositories
  I want one place that lists every pull request that needs my attention
  So that I don't have to check each repository on GitHub in turn

  The Launchpad reads real GitHub data once an account is connected (Settings → Integrations), and
  falls back to deterministic demo data otherwise. Either way, the tabs below the KPI bar all read
  from the one list already loaded: switching tabs narrows what's shown, it never refetches.

  @doc @screenshots
  Scenario: The tabs split PRs into mine, in progress, and waiting on me
    "My Pull Requests" groups everything into what's actionable — ready to merge, needing
    reviewers, blocked on a conflict, waiting on your review, still a draft — so the ones that
    need something from you surface above the rest rather than sitting in one flat list. "Waiting
    for review" narrows the same list down to just those, instantly: no spinner, no second fetch.
    Given the app language is English
    When I open the launchpad
    Then the "prs" launchpad tab shows the pull request "pr-1"
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-prs"
    When I select the "waiting" launchpad tab
    Then the "waiting" launchpad tab shows the pull request "pr-1"
    And the "waiting" launchpad tab shows the pull request "pr-4"
    And the "waiting" launchpad tab does not show the pull request "pr-2"

  @doc @screenshots
  Scenario: Searching across the active tab, and folding every group at once
    The search box above the tabs filters whichever list is on screen by title, author or repo —
    one box that follows you from tab to tab instead of a filter each has to relearn. Collapse and
    expand-all fold or unfold every group of the active tab in one click, for scrolling past a
    list you already know rather than opening each group in turn.
    Given the app language is English
    When I open the launchpad
    And I search the launchpad for "Memory leak"
    Then the "prs" launchpad tab shows the pull request "pr-2"
    And the "prs" launchpad tab does not show the pull request "pr-1"
    When I clear the launchpad search
    And I collapse all launchpad groups
    Then the "prs" launchpad tab does not show the pull request "pr-1"
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-toolbar"
    When I expand all launchpad groups
    Then the "prs" launchpad tab shows the pull request "pr-1"

  # "Selecting a PR opens its detail panel" is documented in the content plan as blocked, not
  # written here: the panel itself opens (no crash, no token needed for that much), but
  # PrDetailCenter's usePrDetail only fires its fetch when a real GitHub token is present — no
  # hasToken-false fallback the way useGitHubData has one — so the panel is left showing "Loading
  # pull request…" forever. Same limitation pr-graph.feature already documents for the graph's own
  # PR surface. Confirmed by driving it end to end rather than assumed from reading the hook.
