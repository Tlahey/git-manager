@wip-directory-batch @ai
Feature: Committing working-tree changes as directory batches

  As a developer with unrelated changes scattered across several folders
  I want each top-level directory committed separately, with its own AI-drafted message
  So that the history stays reviewable without hand-splitting the diff myself

  Batch mode groups every working-tree change by its top-level directory — mechanically, not by
  asking a model to plan the split — then generates one message per group and commits each group on
  its own. Distinct from the AI-planned commit-batches dialog, which asks a model to decide the
  split instead of grouping by folder.

  Background:
    Given the "stash-stack" fixture repository is opened
    And the working tree also has changes in "src" and "docs"

  Scenario: Generating and committing directory batches creates one commit per top-level directory
    Given the app language is English
    And the AI provider is pointed at a fake server
    When I select the working-tree changes in the graph
    And I toggle WIP batch mode on
    And I click the generate-all-batches button
    Then every WIP batch group has a generated message
    When I click the commit-all-batches button
    Then the repository has one commit per changed top-level directory
    And no error notification is displayed
