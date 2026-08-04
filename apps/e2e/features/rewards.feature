@rewards
Feature: Rewards / gamification
  As a user
  I want to be told when I unlock an achievement
  So that my progress feels rewarding

  Background:
    Given the game progress is reset
    And the "stash-stack" fixture repository is opened
    And the notch queue is being recorded

  @doc
  Scenario: Making your first commit unlocks the "First Steps" achievement
    Real actions unlock real achievements, tracked as you work rather than through a separate
    checklist — your very first commit through the app drops a card into the MacBook's notch,
    naming what you just unlocked, with its medal and the XP it earned, and a burst of confetti to
    go with it. It celebrates above the menu bar rather than in a corner of the window, so it finds
    you even when the app is not the thing you are looking at.
    Given the app language is English
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the notch celebrates the achievement "First Steps"

  @doc @screenshots
  Scenario: The Rewards tab shows unlocked and locked achievements
    The Rewards tab (the trophy icon, pinned alongside Dashboard and Launchpad) is the trophy
    cabinet behind every card: your current rank and XP, trophy counts by tier, and every
    achievement grouped by difficulty — unlocked ones showing when you earned them, locked ones
    showing how close you are.
    Given the app language is English
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the notch celebrates the achievement "First Steps"
    When I open the rewards tab
    Then the "commit_1" achievement is shown as unlocked
    And the interface has settled
    And a full-window screenshot is saved as "doc-rewards-tab"
