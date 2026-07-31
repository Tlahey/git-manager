@bisect
Feature: Git bisect
  As a developer hunting a regression
  I want to run git bisect from the tools menu by picking commits in the graph
  So that I can find the commit that introduced a bug without leaving the app

  A bisect is a binary search over your history: give it one commit you know
  is good and one you know is bad, and it checks out the midpoint for you to
  test. Mark each step good or bad from the graph and it narrows the range
  automatically, converging on the exact commit that introduced the problem
  in a handful of steps rather than a manual `git log` hunt.

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

  @doc @screenshots
  Scenario: Picking the good and bad commits opens a range to test
    Starting a bisect from the tools menu opens a floating setup bar with two
    slots, bad and good — click a slot, then click a commit in the graph to
    fill it, no memorising SHAs. The bad commit is usually HEAD, where you
    noticed the regression; the good one can be any earlier commit, or a
    release tag if you have one, like `v1.0.0` here.
    Given the app language is English
    And AI features are turned off
    And the "bisect-history" fixture repository is opened
    When I start a bisect from the tools menu
    And I pick the "HEAD" commit as the "bad" commit
    And I pick the "v1.0.0" commit as the "good" commit
    And the interface has settled
    Then a full-window screenshot is saved as "doc-bisect-setup"

  @doc @screenshots
  Scenario: Testing each checkout narrows the range
    Once the range is confirmed, Git Manager checks out the midpoint between
    your good and bad commits for you to test — run the build, reproduce the
    bug or don't, then mark that commit good or bad from the banner. Each
    answer halves the range and checks out the next candidate automatically,
    so a handful of yes/no answers is all it takes to close in on the exact
    commit that introduced the problem.
    Given the app language is English
    And AI features are turned off
    And the "bisect-history" fixture repository is opened
    When I start a bisect from the tools menu
    And I pick the "HEAD" commit as the "bad" commit
    And I pick the "v1.0.0" commit as the "good" commit
    And I start the bisect
    Then a bisect is in progress
    When I test the current bisect candidate for the bug
    And the interface has settled
    Then a full-window screenshot is saved as "doc-bisect-progress"

  @doc @screenshots
  Scenario: Running a bisect converges on the first bad commit
    A few steps of marking commits good or bad is all it takes: Git Manager
    lands on the exact commit that introduced the regression and shows it in
    a result banner, without you ever leaving the app or touching a terminal.
    Given the app language is English
    And AI features are turned off
    And the "bisect-history" fixture repository is opened
    When I start a bisect from the tools menu
    And I pick the "HEAD" commit as the "bad" commit
    And I pick the "v1.0.0" commit as the "good" commit
    And I start the bisect
    Then a bisect is in progress
    When I bisect by testing for the bug until the first bad commit is found
    And the interface has settled
    Then the first bad commit is "feat: commit 5 (introduces bug)"
    And a full-window screenshot is saved as "doc-bisect-result"

  Scenario: Aborting a bisect ends the session
    When I start a bisect from the tools menu
    And I pick the "HEAD" commit as the "bad" commit
    And I pick the "v1.0.0" commit as the "good" commit
    And I start the bisect
    Then a bisect is in progress
    When I abort the bisect
    Then no bisect is in progress
