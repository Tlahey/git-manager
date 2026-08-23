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

  # Picking a real open issue and confirming it now runs the actual `useCardIssueTracking.
  # addIssueToBoard` write, via the e2e GitHub API mock mode (issue #425,
  # `docs/architecture/2026-08-e2e-github-api-mock-mode.md`) rather than the `mockGitHub` fixture
  # double `useBoardBackends.ts` otherwise falls back to for an account-less repo — this scenario
  # connects a (fake) account specifically so it exercises the real remote board backend.
  @doc @screenshots @github-mock
  Scenario: Opening the dialog to add an existing GitHub issue to the board
    "Add issue", next to New Card on a GitHub board's toolbar, searches the repository's open
    issues — or accepts a pasted issue number or URL for one you already know, including a closed
    one the search wouldn't otherwise offer — and tracks whichever you pick as a card instead of
    creating a new one.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open issue "7" titled "Investigate login timeout" in "octocat/demo-repo"
    And I reload the application
    When I open the board
    And I create a GitHub board named "Support triage" with the card prefix "SUP"
    And I click the add-issue button
    Then the add-issue dialog is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-add-issue"
    When I select the add-issue result "7"
    And I confirm the add-issue selection
    Then the card "Investigate login timeout" is shown on the board
    And no error notification is displayed
