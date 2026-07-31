@rewards
Feature: Rewards / gamification toast
  As a user
  I want to see a toast when I unlock an achievement
  So that my progress feels rewarding

  Background:
    Given the game progress is reset
    And the "stash-stack" fixture repository is opened

  @doc @screenshots
  Scenario: Making your first commit unlocks the "Premier Pas" achievement
    Real actions unlock real achievements, tracked as you work rather than through a separate
    checklist — your very first commit through the app pops a trophy toast naming what you just
    unlocked, without you having to go looking for it.
    Given the app language is English
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the trophy toast shows the achievement "Premier Pas"
    And a full-window screenshot is saved as "doc-rewards-toast"

  @doc @screenshots
  Scenario: The Rewards tab shows unlocked and locked achievements
    The Rewards tab (the trophy icon, pinned alongside Dashboard and Launchpad) is the trophy
    cabinet behind every toast: your current rank and XP, trophy counts by tier, and every
    achievement grouped by difficulty — unlocked ones showing when you earned them, locked ones
    showing how close you are.
    Given the app language is English
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the trophy toast shows the achievement "Premier Pas"
    When I open the rewards tab
    Then the "commit_1" achievement is shown as unlocked
    And the interface has settled
    And a full-window screenshot is saved as "doc-rewards-tab"
