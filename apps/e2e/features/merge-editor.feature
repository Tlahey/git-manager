@merge @conflict
Feature: Three-way merge editor
  As a user resolving a conflict
  I want the three-way merge editor to open for a conflicted file
  So that I can resolve it block by block

  Background:
    Given the "rebase-conflict" fixture is built

  Scenario: The merge editor opens for a conflicted file
    When I open the merge editor for "dependency-manifest.txt"
    Then the merge editor is shown
    And the merge editor offers to auto-merge the non-conflicting blocks

  @visual
  Scenario: The merge editor matches the reference snapshot
    When I open the merge editor for "dependency-manifest.txt"
    Then the merge editor matches the visual snapshot "merge-editor"
