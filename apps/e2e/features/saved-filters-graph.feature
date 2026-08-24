@saved-filters-graph @github-mock
Feature: Managing the commit graph sidebar's saved issue filters

  As a developer with a repeated way of slicing a repository's issues
  I want to save that search as its own sidebar sub-group
  So that I don't retype it every time I open the sidebar

  Creating a filter opens a small dialog reachable from the Issues section header. Editing,
  deleting and reordering a filter all live behind that sub-group's own "…" button, which pops a
  real native OS menu — undrivable by WebDriver, so those three are proven here through the same
  store the menu's own items would call, asserting the sidebar and its persisted state react
  exactly as a real click would have produced.

  Background:
    Given the "feature-branches" fixture repository is opened
    And the app language is English
    And the repository has a GitHub remote "octocat/demo-repo"
    And a GitHub account "octocat" is connected with a fake API token
    And I reload the application
    And I expand the "issues" sidebar section

  Scenario: Creating a saved issue filter adds it to the sidebar
    When I create a saved issue filter named "Needs triage" with the query "is:open label:triage"
    Then the sidebar shows a saved issue filter named "Needs triage"

  Scenario: Editing, reordering and deleting a saved issue filter through its store
    When I create a saved issue filter named "Blocked" with the query "is:open label:blocked"
    And I create a saved issue filter named "Follow-up" with the query "is:open label:follow-up"
    Then the sidebar shows a saved issue filter named "Blocked"
    And the sidebar shows a saved issue filter named "Follow-up"
    When I rename the saved issue filter "Blocked" to "Blocked work"
    Then the sidebar shows a saved issue filter named "Blocked work"
    And the sidebar does not show a saved issue filter named "Blocked"
    When I move the saved issue filter "Follow-up" up
    Then the saved issue filter "Follow-up" is ordered before "Blocked work"
    When I delete the saved issue filter "Blocked work"
    Then the sidebar does not show a saved issue filter named "Blocked work"
    And the sidebar shows a saved issue filter named "Follow-up"
