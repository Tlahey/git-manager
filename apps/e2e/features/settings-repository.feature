@settings
Feature: Repository-specific settings

  As a developer working across several repositories with different needs
  I want some settings scoped to one repository instead of the whole app
  So that a per-project convention doesn't have to become my global default

  Opening a repository adds a Repository group to the settings side panel, labelled with that
  repo's own name. GitFlow, worktree defaults, and runnable tasks live only there — there's no
  global counterpart. Appearance and commit style mirror a matching global page instead, so the
  same field can be set globally and then overridden for just this repository.

  Background:
    Given the "stash-stack" fixture repository is opened
    And the app language is English

  @doc @screenshots
  Scenario: Setting a repository's protected branches
    Protected branches, the default branch name, and PR target branches are inherently
    project-specific — there's no sensible app-wide default, so GitFlow only ever lives in the
    Repository scope.
    When I open the settings
    And I open the "gitflow" repository settings tab
    And I add "release/*" to the repository's protected branches
    Then the repository's protected branches include "release/*"
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-repository-gitflow"

  @doc @screenshots
  Scenario: Overriding the per-repo theme shows as overridden on the global Appearance page
    Switching a mirrored field to Override seeds it from the current effective value, ready to
    edit — and the global page for that same field then shows an "(overridden)" badge, so editing
    it there doesn't look like it silently did nothing.
    When I open the settings
    And I open the "appearance" repository settings tab
    And I override the repository's theme
    And I select the repository theme "light"
    Then the repository theme override is "light"
    When I open the "ui_customization" settings tab
    Then the global theme setting shows as overridden
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-repository-override"

  @doc @screenshots
  Scenario: Choosing which files new worktrees start with
    A worktree created from this repository starts as a fresh checkout — untracked files like a
    local `.env` don't exist in it. A pattern added here copies any matching file from the main
    worktree into every worktree created afterwards, so a second checkout isn't missing what the
    first one has.
    Given the "package-health" fixture repository is opened
    When I open the settings
    And I open the "worktree" repository settings tab
    And I start adding a worktree default file
    And I set the default file pattern to "package.json"
    And I save the worktree default file
    Then the worktree default files list includes "package.json"
    And the interface has settled
    And a full-window screenshot is saved as "doc-worktree-default-files"
    When I delete the worktree default file "package.json"
    Then the worktree default files list is empty

  @doc @screenshots
  Scenario: The repository's own scripts are suggested when adding a task
    Tasks are the commands you start from the app rather than retyping in a
    terminal — a build, a test run, a dev server. You name them yourself, and
    the command field suggests the scripts your repository's `package.json`
    already declares, so the common ones are one click rather than one recall.
    Given the "package-health" fixture repository is opened
    When I open the settings
    And I open the "run" repository settings tab
    And I start adding a repository task
    Then the task command suggestions include "build"
    And the task command suggestions include "test"
    And the interface has settled
    And a full-window screenshot is saved as "doc-repository-tasks"

  @doc @screenshots
  Scenario: A saved task becomes the toolbar's Launch button
    Once a task is saved, it leaves Settings for good: the toolbar grows a
    Launch button. Its main click starts the repository's default task, and
    the arrow beside it lists every task you've defined. Tasks launch in
    your external terminal (the one configured under External tools), in
    the folder of the tab you're on — so in a worktree, the dev server
    starts in that worktree, not in the main checkout.
    Given the app language is English
    And AI features are turned off
    And the "package-health" fixture repository is opened
    When I open the settings
    And I open the "run" repository settings tab
    And I start adding a repository task
    And I name the repository task "Build"
    And I pick the task command suggestion "build"
    And I save the repository task
    And I go back from the settings
    Then the toolbar shows the Launch button
    When I open the toolbar Launch menu
    And the interface has settled
    Then the toolbar Launch menu lists the task "Build"
    And a full-window screenshot is saved as "doc-run-task"

  @doc @screenshots
  Scenario: Choosing which task the Launch button's primary click runs
    With more than one task saved, the first one saved is the default until you say otherwise —
    starring a different task moves the primary click to it, and the arrow menu keeps every task
    reachable either way.
    Given the app language is English
    And AI features are turned off
    And the "package-health" fixture repository is opened
    When I open the settings
    And I open the "run" repository settings tab
    And I start adding a repository task
    And I name the repository task "Build"
    And I pick the task command suggestion "build"
    And I save the repository task
    And I start adding a repository task
    And I name the repository task "Test"
    And I pick the task command suggestion "test"
    And I save the repository task
    And I go back from the settings
    Then the toolbar Launch button's primary action runs the task "Build"
    When I open the settings
    And I open the "run" repository settings tab
    And I set the repository task "Test" as the default
    Then the repository task "Test" is the default
    And I go back from the settings
    Then the toolbar Launch button's primary action runs the task "Test"
    And the interface has settled
    And a full-window screenshot is saved as "doc-run-task-default"
