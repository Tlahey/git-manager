@pr-detail-view @github-mock
Feature: Opening a pull request's detail view

  As a developer reviewing work on a branch
  I want to open its linked pull request without leaving the app
  So that I can read the conversation, checks and changed files next to the commit graph

  When the checked-out branch has an open pull request on GitHub, its status shows right in the
  toolbar — click it to open the same detail view GitHub itself shows: the conversation, the
  merge-readiness checks, and every changed file, without leaving the app or losing your place in
  the commit graph.

  @doc @screenshots
  Scenario: Selecting a linked pull request opens its detail panel
    Clicking the pull-request tag opens the conversation on the left and the changed-files list on
    the right, with the merge box in between showing whether it's ready to go.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    Then the pull request detail panel shows the title "Fix flaky test"
    And the pull request merge panel is shown
    And the pull request files panel lists "app.txt"
    And the interface has settled
    And a full-window screenshot is saved as "doc-pr-detail-view"
    And no error notification is displayed
