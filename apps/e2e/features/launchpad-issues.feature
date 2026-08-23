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

  @doc @screenshots @github-mock
  Scenario: Opening an issue's detail panel
    Selecting an issue opens the same conversation view a pull request does: the description,
    comments, and a sidebar for status, assignees, labels and a linked local branch.
    Given the "feature-branches" fixture repository is opened
    And the repository is a saved project
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open issue "7" titled "Investigate login timeout" in "octocat/demo-repo"
    When I open the launchpad
    And I select the "issues" launchpad tab
    And I open the issue "7" in "octocat/demo-repo"
    Then the issue detail panel shows the title "Investigate login timeout"
    And the issue meta sidebar is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-issue-detail"
    And no error notification is displayed
