@branches
Feature: Creating and checking out branches
  As a user starting new work
  I want to create a branch from the toolbar and switch to it
  So that I don't have to leave the app or reach for a terminal

  The toolbar's Branch button creates a new branch from wherever HEAD is
  right now, without leaving the graph — the same operation the command
  palette's "Create branch here" offers for an older commit, but reachable
  in one click for the common case of branching from HEAD. Creating a
  branch doesn't switch to it; picking it from the branch selector does.

  Background:
    Given the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Creating a branch from the toolbar and checking it out
    Clicking the toolbar's Branch button opens a small popover pre-filled
    with where the new branch will start from — HEAD, by default. Typing a
    name and confirming creates it immediately, without switching to it;
    picking the new branch from the branch selector is the separate step
    that actually checks it out.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    When I click the toolbar branch button
    And I set the new branch name to "feature/reporting"
    And I confirm the new branch creation
    Then the branch "feature/reporting" exists
    When I check out the "feature/reporting" branch
    And the interface has settled
    Then the branch indicator reads "feature/reporting"
    And a full-window screenshot is saved as "doc-branch-create"
