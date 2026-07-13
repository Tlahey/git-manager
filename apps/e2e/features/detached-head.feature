@detached
Feature: Detached HEAD state
  As a user on a detached HEAD
  I want the branch indicator to make that obvious
  So that I don't mistake it for being on a branch

  Background:
    Given the "detached-head" fixture repository is opened

  Scenario: The toolbar shows HEAD instead of a branch name
    Then the branch indicator reads "HEAD"

  Scenario: Checking out a branch from a detached HEAD returns to a named branch
    Then the branch indicator reads "HEAD"
    When I check out the "main" branch
    Then the branch indicator reads "main"
