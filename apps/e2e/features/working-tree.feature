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

  @visual
  Scenario: Viewing a changed file shows its diff
    When I select the working-tree changes in the graph
    And I open the diff for "config.yml"
    Then the file diff matches the visual snapshot "wip-file-diff"

  Scenario: Staging an individual unstaged file
    When I select the working-tree changes in the graph
    And I stage the file "IN_PROGRESS.md"
    Then the file "IN_PROGRESS.md" is staged

  Scenario: Unstaging an individual staged file
    When I select the working-tree changes in the graph
    And I unstage the file "config.yml"
    Then the file "config.yml" is not staged

  Scenario: Bulk-staging all unstaged files
    When I select the working-tree changes in the graph
    And I stage all unstaged files
    Then the file "IN_PROGRESS.md" is staged

  Scenario: Bulk-unstaging all staged files
    When I select the working-tree changes in the graph
    And I unstage all staged files
    Then the file "config.yml" is not staged
