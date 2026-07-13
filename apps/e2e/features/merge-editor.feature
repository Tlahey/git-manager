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

  Scenario: Auto-merging then resolving the remaining conflicts writes the merged result to disk
    Given the "rebase-conflict" fixture repository is opened
    When I click the conflicted file "dependency-manifest.txt" to resolve it
    And I click the merge editor auto-merge wand
    And I accept the right side for every remaining conflicting block
    Then the merge apply button is enabled
    When I click the merge editor apply button
    Then the file "dependency-manifest.txt" is staged and no longer conflicted
    # Wand-resolved modifications (both sides):
    And the file "dependency-manifest.txt" contains the line "http-client = 7.32.0"
    And the file "dependency-manifest.txt" contains the line "json-parser = 2.9.0"
    # Manually accepted via the right gap — the 2 real conflicts (ours wins) and the ours-only
    # deletion/addition the wand deliberately leaves pending (see git_merge_diff.rs):
    And the file "dependency-manifest.txt" contains the line "database-driver = 5.1.0"
    And the file "dependency-manifest.txt" contains the line "auth-provider = 2.1.0"
    And the file "dependency-manifest.txt" contains the line "addon-metrics = 1.0.0"
    And the file "dependency-manifest.txt" does not contain the line "legacy-cache = 0.3.0"
    # Theirs-only deletion/addition were never touched (only the right gap was driven) — the
    # wand's documented default holds: the deletion's kept content stays, the addition stays absent.
    And the file "dependency-manifest.txt" contains the line "deprecated-auth = 0.2.0"
    And the file "dependency-manifest.txt" does not contain the line "theirs-metrics = 1.0.0"
