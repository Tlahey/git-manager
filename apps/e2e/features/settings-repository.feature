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
