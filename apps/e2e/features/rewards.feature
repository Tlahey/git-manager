@rewards
Feature: Rewards / gamification toast
  As a user
  I want to see a toast when I unlock an achievement
  So that my progress feels rewarding

  Background:
    Given the game progress is reset
    And the "stash-stack" fixture repository is opened

  Scenario: Making your first commit unlocks the "Premier Pas" achievement
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the trophy toast shows the achievement "Premier Pas"
