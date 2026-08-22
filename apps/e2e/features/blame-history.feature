@blame @history
Feature: File blame and history
  As a user reviewing a file
  I want its commit history and per-line blame
  So that I can see who changed what, and jump to older versions

  Any open diff can switch from the usual line-by-line Diff view to a File
  view, where the gutter carries the avatar of whoever last touched each line
  — read from a real `git blame`, not inferred from the diff. The same diff
  can also open the file's full history: every commit that touched it, so you
  can step back to an older version and see its diff without leaving the app.

  # feature-branches: app.txt is created in "chore: initial app" and modified in
  # "chore: extend app on main" (HEAD), so it has real multi-commit history + blame.
  # The diff is opened deterministically via the e2e store hook (no racy graph clicks).
  Background:
    Given the "feature-branches" fixture repository is opened
    And I open the diff for "app.txt" at "HEAD"

  Scenario: The history panel lists the file's versions
    When I open the file history
    Then the history panel lists at least 1 version

  @doc @screenshots
  Scenario: The File view shows blame avatars in the gutter
    Switching a diff to the File view turns on a blame gutter: each line shows
    the avatar of whoever last touched it, resolved through a real `git blame`
    on the file rather than guessed from the diff. It's the fastest way to
    answer "who wrote this line, and when" for any file you already have open.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    And I open the diff for "app.txt" at "HEAD"
    When I switch to the File view
    And the interface has settled
    Then the blame gutter shows at least one author avatar
    And a full-window screenshot is saved as "doc-blame-gutter"

  @doc @screenshots
  Scenario: Blame mode annotates lines with the commit name
    The gutter avatars answer "who" at a glance; blame mode adds "which commit" next to it — a
    column naming the commit that last touched each line, right in the editor, for when the
    avatar alone isn't enough to place the change in history.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    And I open the diff for "app.txt" at "HEAD"
    When I switch to the File view
    And I enable blame mode
    And the interface has settled
    Then the blame column shows a commit annotation
    And a full-window screenshot is saved as "doc-blame-mode"

  @doc @screenshots
  Scenario: Selecting a history version shows that version in the diff
    Opening a file's history lists every commit that touched it, newest
    first, same as the graph. Selecting an older version swaps the diff to
    show that version instead of the one you started from — a version bar
    marks which commit you're looking at, so you can compare revisions
    without checking anything out.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    And I open the diff for "app.txt" at "HEAD"
    When I open the file history
    And I select the first history version
    And the interface has settled
    Then the diff shows the version SHA bar
    And a full-window screenshot is saved as "doc-file-history"
