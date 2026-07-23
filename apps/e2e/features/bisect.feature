@bisect
Feature: Git bisect
  As a developer hunting a regression
  I want to run git bisect from the tools menu by picking commits in the graph
  So that I can find the commit that introduced a bug without leaving the app

  Background:
    Given the "bisect-history" fixture repository is opened

  Scenario: Starting a bisect from the tools menu opens the setup bar
    When I start a bisect from the tools menu
    Then the bisect setup bar is shown
    When I cancel the bisect setup
    Then the bisect setup bar is not shown

  Scenario: An inverted good/bad range is rejected
    When I start a bisect from the tools menu
    And I pick the "v1.0.0" commit as the "bad" commit
    And I pick the "HEAD" commit as the "good" commit
    Then the bisect setup reports an invalid range
    And the bisect cannot be started

  Scenario: Running a bisect converges on the first bad commit
    When I start a bisect from the tools menu
    And I pick the "HEAD" commit as the "bad" commit
    And I pick the "v1.0.0" commit as the "good" commit
    And I start the bisect
    Then a bisect is in progress
    When I bisect by testing for the bug until the first bad commit is found
    Then the first bad commit is "feat: commit 5 (introduces bug)"

  Scenario: Aborting a bisect ends the session
    When I start a bisect from the tools menu
    And I pick the "HEAD" commit as the "bad" commit
    And I pick the "v1.0.0" commit as the "good" commit
    And I start the bisect
    Then a bisect is in progress
    When I abort the bisect
    Then no bisect is in progress
