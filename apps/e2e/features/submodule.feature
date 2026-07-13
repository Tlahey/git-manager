@submodule
Feature: Submodule listing
  As a user with a submodule in my repo
  I want to see it in the sidebar
  So that I know it's there

  Background:
    Given the "submodule-repo" fixture repository is opened

  Scenario: The sidebar lists a real git submodule
    When I expand the "submodules" sidebar section
    Then the sidebar lists the submodule "vendor/shared-lib"
