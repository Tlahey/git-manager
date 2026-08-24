@pr-actions @github-mock
Feature: Acting on a pull request from its detail view

  As a developer reviewing or driving a pull request
  I want to comment, review, merge and edit it without leaving the app
  So that GitHub stays in sync with what I did in the commit graph

  The PR detail view isn't just a read-only mirror of GitHub — every write action (comment, review,
  merge, close/reopen, draft toggle, branch update, and the reviewer/assignee/label editors) reaches
  a real GitHub round trip, not just local state.

  Scenario: Viewing a pull request's comments and unresolved review threads
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And the GitHub mock server pull request "42" in "octocat/demo-repo" has a comment "Looks good to me!" from "reviewer1"
    And the GitHub mock server pull request "42" in "octocat/demo-repo" has an unresolved review thread on "app.txt" from "reviewer1" saying "Should this be a constant?"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    Then the pull request comments list shows "Looks good to me!"
    And the pull request shows an unresolved code suggestion on "app.txt"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Posting a comment on a pull request
    Replying to a pull request writes a real comment straight to GitHub — no need to switch to
    the browser to keep the conversation going.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I post the comment "Thanks for the fix!" on the pull request
    Then the pull request comments list shows "Thanks for the fix!"
    And the interface has settled
    And a full-window screenshot is saved as "doc-pr-actions-comment"
    And no error notification is displayed

  Scenario: Submitting an approving review on a pull request
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I submit an approving review on the pull request
    Then the pull request shows the review as approved
    And no error notification is displayed

  @doc @screenshots
  Scenario: Merging a pull request
    Once checks are green, merging happens right where you were reviewing — pick a strategy from
    the split button and the pull request is merged on GitHub without leaving the app.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I merge the pull request
    Then the pull request is shown as merged
    And the interface has settled
    And a full-window screenshot is saved as "doc-pr-actions-merge"
    And no error notification is displayed

  Scenario: Closing and reopening a pull request
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I close the pull request
    Then the pull request shows the reopen action
    When I reopen the pull request
    Then the pull request shows the close action
    And no error notification is displayed

  Scenario: Converting a pull request to draft and back to ready
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I convert the pull request to a draft
    Then the pull request shows the mark-ready action
    When I mark the pull request as ready for review
    Then the pull request shows the convert-to-draft action
    And no error notification is displayed

  @doc @screenshots
  Scenario: Editing a pull request's labels
    Reviewers, assignees and labels are all editable from the side panel through the same
    search-and-select popover, so tidying up a pull request's metadata never means a trip to
    GitHub.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And the GitHub mock server "octocat/demo-repo" has a label "bug"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I open the pull request's labels editor
    And I add the label "bug" to the pull request
    Then the pull request shows the label "bug"
    And the interface has settled
    And a full-window screenshot is saved as "doc-pr-actions-labels"
    When I remove the label "bug" from the pull request
    Then the pull request no longer shows the label "bug"
    And no error notification is displayed

  Scenario: Requesting and removing a pull request reviewer
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And the GitHub mock server "octocat/demo-repo" has an assignable user "hubot"
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    And I open the pull request's reviewers editor
    And I request "hubot" as a reviewer on the pull request
    Then the pull request lists "hubot" as a reviewer
    When I remove "hubot" as a reviewer on the pull request
    Then the pull request no longer lists "hubot" as a reviewer
    And no error notification is displayed

  Scenario: Updating an out-of-date pull request branch
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And the GitHub mock server has an open pull request "42" on branch "feature/login" titled "Fix flaky test" in "octocat/demo-repo"
    And the GitHub mock server pull request "42" in "octocat/demo-repo" is behind its base branch
    And I reload the application
    When I check out the "feature/login" branch
    Then the pull request status tag "42" is shown
    When I open the pull request from its status tag "42"
    Then the pull request shows it is behind its base branch
    When I update the pull request's branch
    Then the pull request no longer shows it is behind its base branch
    And no error notification is displayed
