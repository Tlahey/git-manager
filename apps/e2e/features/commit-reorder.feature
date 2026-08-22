@rebase @conflict
Feature: Reordering and combining commits by dragging them in the graph

  As a user tidying up recent history
  I want to drag one commit onto or between others in the graph
  So that I don't have to open a separate editor just to combine two commits

  Dropping a commit *onto* another folds the two together — the same combine a squash/fixup in
  the interactive rebase editor produces — and dropping it *between* two others just moves it
  there. Either way nothing is rewritten until a confirmation dialog previews the result: what
  moves, where it lands, and, for a combine, whether the folded commit keeps its own message.

  Background:
    Given the "rollback-history" fixture repository is opened

  @doc @screenshots
  Scenario: Dragging a commit onto its parent combines them
    Dragging the newest commit onto the one right before it previews a fold: the dialog lists the
    resulting history with the combined commit marked, and a mode picker decides whether the
    dragged commit's own message survives alongside the target's, or is folded in silently.
    Given the app language is English
    And AI features are turned off
    And the "rollback-history" fixture repository is opened
    When I drag the commit "chore: bump counter to 4" onto the commit "chore: bump counter to 3"
    Then the commit reorder dialog is shown
    And the commit reorder preview marks "chore: bump counter to 4" as moved
    And the interface has settled
    And a full-window screenshot is saved as "doc-commit-reorder"
    When I confirm the commit reorder
    Then the repository HEAD commit subject contains "chore: bump counter to 3"
    And the repository log holds 4 commits
    And the working file "counter.txt" holds the line "counter=4"
