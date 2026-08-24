@rewards
Feature: Rewards / gamification
  As a user
  I want to be told when I unlock an achievement
  So that my progress feels rewarding

  Background:
    Given the game progress is reset
    And the "stash-stack" fixture repository is opened
    And the notch queue is being recorded

  @doc
  Scenario: Making your first commit unlocks the "First Steps" achievement
    Real actions unlock real achievements, tracked as you work rather than through a separate
    checklist — your very first commit through the app drops a card into the MacBook's notch,
    naming what you just unlocked, with its medal and the XP it earned, and a burst of confetti to
    go with it. It celebrates above the menu bar rather than in a corner of the window, so it finds
    you even when the app is not the thing you are looking at.
    Given the app language is English
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the notch celebrates the achievement "First Steps"

  @doc @screenshots
  Scenario: The Rewards tab shows unlocked and locked achievements
    The Rewards tab (the trophy icon, pinned alongside Dashboard and Launchpad) is the trophy
    cabinet behind every card: your current rank and XP, trophy counts by tier, and every
    achievement grouped by difficulty — unlocked ones showing when you earned them, locked ones
    showing how close you are.
    Given the app language is English
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the notch celebrates the achievement "First Steps"
    When I open the rewards tab
    Then the "commit_1" achievement is shown as unlocked
    And the interface has settled
    And a full-window screenshot is saved as "doc-rewards-tab"

  Scenario Outline: Running a themed git command in the terminal unlocks its achievement
    Fourteen of the app's achievements are tied to specific git plumbing and porcelain commands —
    not typed into the app's own integrated terminal, but observed in the ordinary shell history
    file any terminal writes to. The first time one of these commands shows up there while Git
    Manager is open, its themed achievement unlocks.
    Given the app language is English
    And the shell history already holds an unrelated git command
    When I open the rewards tab
    And the shell-history baseline has been read
    And I run "<command>" in the shell
    Then the notch celebrates the achievement "<title>"

    Examples:
      | command                                           | title                |
      | git status                                        | Status Inspector     |
      | git log --oneline                                 | Local Historian      |
      | git diff                                           | Code Watcher         |
      | git branch --all                                   | Branch Explorer      |
      | git stash list                                     | Stash Inspector      |
      | git bisect start                                   | Dichotomy Detective  |
      | git cherry-pick abc1234                            | Precise Picker       |
      | git rebase -i HEAD~3                               | Time Surgeon         |
      | git worktree list                                  | Advanced Multitasker |
      | git submodule status                               | Matryoshka Inspector |
      | git filter-branch --force                          | History Rewriter     |
      | git verify-pack -v .git/objects/pack/pack-e2e.idx  | Repository Archivist |
      | git write-tree                                     | Chief Plumber        |
      | git cat-file -p HEAD                               | Raw Object Inspector |

  Scenario: Opening the launchpad unlocks the "Apprentice Observer" achievement
    Given the app language is English
    When I switch to the launchpad tab
    Then the notch celebrates the achievement "Apprentice Observer"

  Scenario: Staging then unstaging the same file unlocks the "Undeniably Indecisive" achievement
    Given the app language is English
    When I select the working-tree changes in the graph
    And I stage the file "IN_PROGRESS.md"
    And the interface has settled
    And I unstage the file "IN_PROGRESS.md"
    Then the notch celebrates the achievement "Undeniably Indecisive"

  Scenario: Discarding a file's changes unlocks the "Back to the Future" achievement
    Given the app language is English
    When I select the working-tree changes in the graph
    And I discard the changes to "config.yml"
    Then the notch celebrates the achievement "Back to the Future"

  # The fixup commit runs in its own real WebviewWindow (see fixup.steps.ts), a separate JS
  # runtime from the main window this scenario's notch recording is installed on — so unlike
  # every other achievement here, its unlock never reaches the main window's notch queue live.
  # It IS persisted for real (the fixup window's own store instance writes it to localStorage),
  # just not celebrated until the main window re-reads it — which a reload does, the same as it
  # would for a real user relaunching the app.
  Scenario: Creating a fixup commit unlocks the "Discreet Surgeon" achievement
    Given the app language is English
    And the "fixup-chain" fixture repository is opened
    When I open the command palette
    And I run the command palette action "commit-fixup"
    Then the fixup commit window is shown
    When I confirm the fixup commit
    And I reload the application
    And I open the rewards tab
    Then the "fixup" achievement is shown as unlocked

  Scenario: Running autosquash unlocks the "History Architect" achievement
    Given the app language is English
    And the "fixup-chain" fixture repository is opened
    And the notch queue is being recorded
    When I open the autosquash preview
    And I confirm the autosquash
    Then the notch celebrates the achievement "History Architect"
