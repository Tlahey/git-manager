@pr-review-hover @github-mock
Feature: Hovering a sidebar pull request shows its review summary

  As a developer scanning the sidebar's pull request list
  I want to see reviewer and check status without opening the pull request
  So that I can triage at a glance

  Resting the pointer on a pull request row lazily fetches its reviewer approvals and check status,
  showing them in a hover card next to the row — a single GraphQL round trip fired only once the row
  is actually hovered, cached afterwards.

  @doc @screenshots
  Scenario: Hovering a pull request row shows its reviewer and checks
    Resting the pointer on a pull request in the sidebar's list is enough to see where it stands —
    who has reviewed it and whether its checks pass — without opening it. The reviewer and check
    data is fetched the first time a row is hovered, not before, and reused after that.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And the GitHub mock server has a review summary for pull request "42" in "octocat/demo-repo"
    And I reload the application
    When I expand the "prs" sidebar section
    And I focus the sidebar pull request "42"
    Then the pull request hover card "42" is shown
    And the pull request hover card "42" lists reviewer "hubot" as "APPROVED"
    And the interface has settled
    And a full-window screenshot is saved as "doc-pr-review-hover"
    And no error notification is displayed
