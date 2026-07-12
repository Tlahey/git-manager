@stash
Feature: Stash list
  As a user with stashed changes
  I want to see my stashes listed in the sidebar
  So that I can find and restore them

  Background:
    Given the "stash-stack" fixture repository is opened

  Scenario: The sidebar lists the stashed changes
    When I expand the "stashes" sidebar section
    Then the sidebar lists 2 stashes
