@commits @staging
Feature: Working tree staging
  As a user with uncommitted changes
  I want to select the working-tree node and see my changes staged for commit
  So that I can craft a commit

  Background:
    Given the "stash-stack" fixture repository is opened

  Scenario: Selecting the working-tree node shows the staging panel
    When I select the working-tree changes in the graph
    Then the staging panel is shown

  @visual
  Scenario: The staging panel matches the reference snapshot
    When I select the working-tree changes in the graph
    Then the staging panel matches the visual snapshot "wip-staging-panel"
