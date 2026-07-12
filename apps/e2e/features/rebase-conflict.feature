@rebase @conflict
Feature: Rebase conflict resolution
  As a user whose rebase paused on a conflict
  I want the conflict resolution panel to surface automatically
  So that I can continue, skip or abort without hunting for it

  Background:
    Given the "rebase-conflict" fixture repository is opened

  Scenario: A paused rebase auto-opens the conflict resolution panel
    Then the conflict resolution panel is shown
    And the conflict panel offers to skip or abort the rebase

  @visual
  Scenario: The conflict resolution panel matches the reference snapshot
    Then the conflict resolution panel matches the visual snapshot "conflict-resolution-panel"
