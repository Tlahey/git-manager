@board-github
Feature: Backed by GitHub Issues

  A repository with a connected GitHub account can create a board whose cards are real GitHub
  issues, shared with the team, instead of commits in this clone's own `.git` — see
  [the local board](./board) for the one that needs nothing set up. Every card field GitHub has a
  home for uses it:
  the assignee is the issue's own assignee, tags and priority are real labels, and a column is a
  label of its own — so the board and github.com stay in agreement rather than the app hiding
  state in a private encoding.

  @doc @screenshots
  Scenario: Creating a board backed by GitHub issues
    Choosing "GitHub" instead of "Local" when creating a board is the whole of the choice: the same
    dialog, the same fields afterwards — a card is added, assigned and prioritised exactly the way
    a local one is. The sidebar's only difference is the subtitle under the board's name, marking it
    shared with the team rather than private to this clone.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a GitHub board named "Support triage" with the card prefix "SUP"
    Then the board "Support triage" is a GitHub board
    When I add a card titled "Investigate login timeout" to the "To do" column
    And I open the card "Investigate login timeout"
    And I assign the card to "Marie Dubois"
    And I set the card priority to "High"
    Then the card "Investigate login timeout" is identified as "SUP-1"
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-github"
    And no error notification is displayed

  # Screenshot only: browsing and picking from the repository's real open issues, and the write
  # that follows (`useCardIssueTracking.addIssueToBoard`), both need a real connected GitHub
  # account — the one thing this suite cannot fake (see command-mocking.feature's own note on
  # `github_api_request` calls the app's own click triggers, which `browser.tauri.mock` can't
  # intercept, and the suite's deliberate avoidance of hitting the real, anonymous GitHub API).
  # This documents that the entry point exists without exercising what is behind it.
  @doc @screenshots
  Scenario: Opening the dialog to add an existing GitHub issue to the board
    "Add issue", next to New Card on a GitHub board's toolbar, searches the repository's open
    issues — or accepts a pasted issue number or URL for one you already know, including a closed
    one the search wouldn't otherwise offer — and tracks whichever you pick as a card instead of
    creating a new one.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a GitHub board named "Support triage" with the card prefix "SUP"
    And I click the add-issue button
    Then the add-issue dialog is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-add-issue"
