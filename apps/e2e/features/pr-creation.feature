@pr-creation @github-mock
Feature: Creating a pull request from the sidebar

  As a developer with local work ready to share
  I want to open a pull request without leaving the app
  So that pushing and filing the PR are one flow, not a trip to GitHub

  The "+" next to the sidebar's Pull Requests section opens a standalone create-PR form — pick a
  head and base branch, write a title, then submit. The branch is pushed and the PR filed against
  a real GitHub round trip in one step.

  @doc @screenshots
  Scenario: Creating a pull request from an already-committed branch
    The head branch is pushed first, then the pull request is filed — opening straight into its
    detail view once GitHub has it.
    Given the app language is English
    And the "remote-ahead" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And I reload the application
    When I open the create-pr form
    And I set the pull request base branch to "feature/diverged"
    And I fill in the pull request title "Ship the local work"
    And I create the pull request
    Then the pull request detail panel shows the title "Ship the local work"
    And the interface has settled
    And a full-window screenshot is saved as "doc-pr-creation"
    And no error notification is displayed
