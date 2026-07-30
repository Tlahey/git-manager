@submodule
Feature: Submodule listing
  As a user with a submodule in my repo
  I want to see it in the sidebar
  So that I know it's there

  Real git submodules — not just folders that look like one — show up in
  their own sidebar section, so you always know when a repository nests
  another one.

  Background:
    Given the "submodule-repo" fixture repository is opened

  @doc @screenshots
  Scenario: The sidebar lists a real git submodule
    A repository's submodules show up in their own sidebar section, read
    straight from `.gitmodules` and the real submodule state on disk — not
    guessed from folder names.
    Given the app language is English
    And AI features are turned off
    And the "submodule-repo" fixture repository is opened
    When I expand the "submodules" sidebar section
    And the interface has settled
    Then the sidebar lists the submodule "vendor/shared-lib"
    And a full-window screenshot is saved as "doc-submodule-sidebar"
