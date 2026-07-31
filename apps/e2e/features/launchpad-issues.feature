@launchpad
Feature: Issue triage

  As a developer tracking issues across the repos I've added
  I want to browse them without leaving the app
  So that triage doesn't mean switching tabs to GitHub

  @doc @screenshots
  Scenario: The Issues tab lists open issues from every repo you're tracking
    Every issue filed on a repo you've added shows up here — not just the ones assigned to you —
    so triage doesn't depend on guessing who's watching what. It defaults to open issues; closed
    ones stay a filter away rather than living in a separate tab.
    Given the app language is English
    When I open the launchpad
    And I select the "issues" launchpad tab
    Then the "issues" launchpad tab shows the issue "issue-1"
    And the "issues" launchpad tab does not show the issue "issue-4"
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-issues"

  # Opening an issue's detail panel is documented in the content plan as blocked, not written here:
  # IssueDetailCenter's useIssueDetail is a straight copy of usePrDetail (its own doc comment says
  # "Mirrors usePrDetail") — it only fetches with a real GitHub token, no hasToken-false fallback,
  # so the panel is left on "Loading issue…" forever. Same limitation as launchpad-prs.feature's
  # blocked sub-part and pr-graph.feature.
