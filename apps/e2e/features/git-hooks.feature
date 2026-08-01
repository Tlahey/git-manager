# Why these exist, which is test rationale rather than anything a reader of the
# documentation needs: libgit2 runs no hooks at all, so every hook a repository
# installed was silently skipped for anything done from this app — the same commit
# passing in a terminal and passing here for entirely different reasons. The
# fixtures below carry real, executable hooks, so what is asserted is that a
# genuine script ran, refused, and had its own output carried back.
@hooks @notch
Feature: Repository hooks
  As a user whose repository installs its own quality gates
  I want the app to run them exactly as the command line does
  So that a commit made here cannot bypass a check a commit made there would fail

  A repository can install scripts that Git runs before it records or sends
  anything, and that refuse the operation when they are not happy. They are how a
  project keeps unformatted code, a bad commit message or a failing test suite
  out of its history — and they apply here exactly as they do in a terminal.

  @doc @screenshots
  Scenario: Your repository's hooks run here exactly as they do in a terminal
    `pre-commit` and `commit-msg` run on every commit you make here, and
    `pre-push` on every push. When one refuses, nothing is written and nothing
    reaches the remote — and the notification card that appears carries the
    hook's own output, because "a hook refused" tells you nothing you can act on
    while the lines it printed tell you exactly which file and which rule. A slow
    one says so while it works, rather than leaving the app looking frozen.

    A hook that hangs or misfires should not be able to lock you out, so the
    caret beside Commit — and the one beside Push — offers to run the operation
    without them. It is a choice you make once, for one commit, rather than a
    setting you can leave switched on and forget: hooks quietly not running is
    the thing this is here to prevent.
    Given the app language is English
    And AI features are turned off
    And the "hooks-plain" fixture repository is opened
    When I select the working-tree changes in the graph
    And I stage the file "clean.txt"
    And I enter the commit message "chore: tidy the sample config"
    And I open the commit options
    Then the commit options offer to skip the hooks
    And a full-window screenshot is saved as "doc-git-hooks"

  Scenario: A pre-commit hook that refuses stops the commit and shows its output
    Given the "hooks-plain" fixture repository is opened
    And the notch queue is being recorded
    When I select the working-tree changes in the graph
    And I stage the file "trip-precommit.txt"
    And I enter the commit message "chore: this must not land"
    And I commit the staged changes
    Then the repository HEAD commit subject remains "chore: bulk payload so a push has something to transfer"
    And the notch reported the "pre-commit" hook running
    And the notch shows the "pre-commit" hook's output
    And the notch output mentions "BREAK-PRECOMMIT"

  Scenario: A commit the hooks accept goes through as it always did
    Given the "hooks-plain" fixture repository is opened
    And the notch queue is being recorded
    When I select the working-tree changes in the graph
    And I stage the file "clean.txt"
    And I enter the commit message "chore: a commit every hook accepts"
    And I commit the staged changes
    Then the repository HEAD commit subject is "chore: a commit every hook accepts"
    And the notch raises no hook failure

  # The resolution path most real projects are actually on, and the one nothing covered
  # end-to-end: husky keeps its hooks in the working tree and points `core.hooksPath` at them,
  # so a lookup that only knew about `.git/hooks` would find nothing and silently run none.
  Scenario: Hooks installed husky-style through core.hooksPath run just the same
    Given the "hooks-husky" fixture repository is opened
    And the notch queue is being recorded
    When I select the working-tree changes in the graph
    And I stage the file "trip-precommit.txt"
    And I enter the commit message "chore: this must not land either"
    And I commit the staged changes
    Then the repository HEAD commit subject remains "chore: install husky-style hooks under .husky"
    And the notch shows the "pre-commit" hook's output
