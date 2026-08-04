@rebaseeditor
Feature: Interactive rebase editor (reword / squash / drop)

  Git's `git rebase -i` drops you into a text file where one typo rewrites the
  wrong commit. Git Manager replaces that file with a plan editor in its own
  window: every commit of the range is a row, and the toolbar marks rows to be
  reworded, squashed together, or dropped. Nothing touches the repository until
  you confirm — the plan is just a plan, and Cancel throws it away.

  # The "Rebasing Commit" editor (RebasingCommitWindow) renders entirely from URL params —
  # main.tsx routes `?window=rebase&repoPath=…&baseOid=…` to it, same as the merge editor's
  # `?window=merge`. Unlike the merge editor's read-only scenarios, this window cannot borrow the
  # shared main window: BOTH its exit paths (Start Rebasing and Cancel) call
  # `getCurrentWindow().close()`, which would kill the run's one shared window. So each scenario
  # opens a REAL second WebviewWindow with exactly the URL production's `openRebaseWindow`
  # (lib/graphWindows.ts) builds — everything from there on is real: `list_rebase_commits` fills
  # the plan, the toolbar drives it, and Start Rebasing runs the real `run_interactive_rebase`
  # (git rebase -i with an injected todo), asserted against `git log` on disk.
  #
  # Fixture: rollback-history — five linear commits all bumping counter.txt. Each commit rewrites
  # the whole file, so a *dropped or squashed* step must sit at the tip of the edited range
  # (nothing replays on top of it) or git would pause on a conflict; a reword never changes a
  # tree, so it can sit anywhere in the range.

  Background:
    Given the "rollback-history" fixture repository is opened

  @doc @screenshots
  Scenario: Edit the plan, then rewrite history in one go
    Open the editor from a commit and every commit from there to the branch
    tip becomes a row of the plan. Select a row to reword its message, or
    select several (⌘-click) to squash them into one commit — each edit shows
    as a badge on its row, and you can pile up as many as you need. When the
    plan reads right, one click on Start Rebasing replays the whole range;
    until then, nothing has happened to your repository.
    Given the app language is English
    When I open the interactive rebase editor from the "HEAD~2" commit
    And I select the rebase step "chore: bump counter to 2"
    And I reword the selected rebase step to "chore: bump counter to two"
    And I select the rebase step "chore: bump counter to 3"
    And I add the rebase step "chore: bump counter to 4" to the selection
    And I squash the selected rebase steps keeping both messages
    And the interface has settled
    Then a full-window screenshot is saved as "doc-interactive-rebase"
    When I start the interactive rebase
    Then the repository log lists the subject "chore: bump counter to two"
    And the repository HEAD commit message contains "chore: bump counter to 4"
    And the repository log holds 4 commits
    And the working file "counter.txt" holds the line "counter=4"

  Scenario: Rewording a commit rewrites its message in history
    When I open the interactive rebase editor from the "HEAD~2" commit
    And I select the rebase step "chore: bump counter to 3"
    And I reword the selected rebase step to "chore: bump counter to three"
    And I start the interactive rebase
    Then the repository log lists the subject "chore: bump counter to three"
    And the repository log does not list the subject "chore: bump counter to 3"
    And the repository log holds 5 commits
    And the working file "counter.txt" holds the line "counter=4"

  Scenario: Dropping the tip commit removes it from history
    When I open the interactive rebase editor from the "HEAD~1" commit
    And I select the rebase step "chore: bump counter to 4"
    And I mark the selected rebase step as dropped
    And I start the interactive rebase
    Then the repository HEAD commit subject contains "chore: bump counter to 3"
    And the repository log holds 4 commits
    And the working file "counter.txt" holds the line "counter=3"

  Scenario: Squashing the two newest commits combines them into one
    When I open the interactive rebase editor from the "HEAD~1" commit
    And I select the rebase step "chore: bump counter to 3"
    And I add the rebase step "chore: bump counter to 4" to the selection
    And I squash the selected rebase steps keeping both messages
    And I start the interactive rebase
    Then the repository HEAD commit subject contains "chore: bump counter to 3"
    And the repository HEAD commit message contains "chore: bump counter to 4"
    And the repository log holds 4 commits
    And the working file "counter.txt" holds the line "counter=4"
