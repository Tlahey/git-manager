@issue-actions @github-mock
Feature: Acting on an issue from its detail view

  As a developer triaging issues across connected repos
  I want to edit, close/reopen, label, assign and file issues without leaving the app
  So that GitHub stays in sync with what I did here

  The issue detail view mirrors the pull request one — editing the title, toggling open/closed, and
  editing labels/assignees all reach a real GitHub round trip, not just local state. Filing a brand
  new issue from the graph sidebar is the other half: a quick capture that never needs the browser.

  @doc @screenshots
  Scenario: Editing an issue's title
    Clicking the title turns it into an inline editor — saving writes the new title straight to
    GitHub, the same way the pull request title does.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository is a saved project
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open issue "7" titled "Investigate login timeout" in "octocat/demo-repo"
    When I open the launchpad
    And I select the "issues" launchpad tab
    And I open the issue "7" in "octocat/demo-repo"
    Then the issue detail panel shows the title "Investigate login timeout"
    When I rename the issue to "Investigate login timeout on Safari"
    Then the issue detail panel shows the title "Investigate login timeout on Safari"
    And the interface has settled
    And a full-window screenshot is saved as "doc-issue-actions-title"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Closing and reopening an issue
    The status dropdown in the sidebar toggles between open and closed — a real GitHub state
    change either way, not just a local flag.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository is a saved project
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open issue "7" titled "Investigate login timeout" in "octocat/demo-repo"
    When I open the launchpad
    And I select the "issues" launchpad tab
    And I open the issue "7" in "octocat/demo-repo"
    And I close the issue
    Then the issue is shown as closed
    And the interface has settled
    And a full-window screenshot is saved as "doc-issue-actions-closed"
    When I reopen the issue
    Then the issue is shown as open
    And no error notification is displayed

  @doc @screenshots
  Scenario: Editing an issue's labels
    Labels are editable straight from the side panel through the same search-and-select popover
    the pull request view uses.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository is a saved project
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open issue "7" titled "Investigate login timeout" in "octocat/demo-repo"
    And the GitHub mock server "octocat/demo-repo" has a label "bug"
    When I open the launchpad
    And I select the "issues" launchpad tab
    And I open the issue "7" in "octocat/demo-repo"
    And I open the issue's labels editor
    And I add the label "bug" to the issue
    Then the issue shows the label "bug"
    And the interface has settled
    And a full-window screenshot is saved as "doc-issue-actions-labels"
    When I remove the label "bug" from the issue
    Then the issue no longer shows the label "bug"
    And no error notification is displayed

  Scenario: Assigning and unassigning an issue
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository is a saved project
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open issue "7" titled "Investigate login timeout" in "octocat/demo-repo"
    And the GitHub mock server "octocat/demo-repo" has an assignable user "hubot"
    When I open the launchpad
    And I select the "issues" launchpad tab
    And I open the issue "7" in "octocat/demo-repo"
    And I open the issue's assignees editor
    And I assign "hubot" to the issue
    Then the issue lists "hubot" as an assignee
    When I unassign "hubot" from the issue
    Then the issue no longer lists "hubot" as an assignee
    And no error notification is displayed

  Scenario: Filing a new issue from the graph sidebar
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And I reload the application
    When I open the create-issue dialog
    And I fill in the new issue title "File a repro for the login bug"
    And I submit the new issue
    Then the create-issue dialog is closed
    And no error notification is displayed
