@compare
Feature: Comparing two branches
  As a user who wants to know what changed between two lines of development
  I want to diff any branch against any other branch
  So that I don't have to guess from the graph alone

  The "Compare <branch> with…" entry — on a graph branch pill or a sidebar
  branch row's native context menu — opens a dedicated dialog that diffs two
  arbitrary refs directly against each other, independent of what is
  currently checked out. Either side can be re-picked from the same branch
  list without closing the dialog, and swapping them is a different diff,
  not a cosmetic flip.

  Background:
    Given the app language is English
    And AI features are turned off
    And the "remote-ahead" fixture repository is opened

  Scenario: Comparing two branches shows their real, per-file differences
    "feature/diverged" branches off before "main"'s last commit and adds its
    own file, so diffing the two has exactly one modified file and one new
    file — a concrete, known difference the real backend has to compute.
    When I compare "main" with "feature/diverged"
    Then the compare branches dialog is shown
    And the compare branches summary reads "2 files changed"
    And the compare branches diff includes the file "app.txt"
    And the compare branches diff includes the file "shared.txt"

  Scenario: Swapping sides reverses which branch each change comes from
    Diffing "main" against "feature/diverged" or the other way around is not
    the same question, and the backend has to be asked again — not just have
    its answer flipped on screen.
    When I compare "main" with "feature/diverged"
    Then the file "shared.txt" in the compare view shows 1 addition and 0 deletions
    And the file "app.txt" in the compare view shows 0 additions and 1 deletion
    When I swap the compared sides
    Then the file "shared.txt" in the compare view shows 0 additions and 1 deletion
    And the file "app.txt" in the compare view shows 1 addition and 0 deletions

  Scenario: Re-picking a side through the branch picker loads a real diff
    Opening the dialog on two identical refs is a safe starting point — no
    backend call is even made — until one side is re-picked through the
    dialog's own branch selects, the same control a user would drive by hand.
    When I compare "main" with "main"
    Then the compare branches dialog reports the two sides are identical
    When I pick "feature/diverged" as the compare head
    Then the compare branches diff includes the file "shared.txt"
    And the compare branches diff includes the file "app.txt"
