@ai
Feature: AI commit-message generation
  As a user with staged changes
  I want an AI-drafted commit message
  So that I don't have to write it by hand

  Background:
    Given the "stash-stack" fixture repository is opened

  Scenario: Generating a commit message streams the response and sends the customized prompt
    Given the AI provider is pointed at a fake server with a custom prompt
    When I select the working-tree changes in the graph
    And I click the commit-generate button
    Then the commit message becomes "feat: add fake thing"
    And the sent prompt's system message contains "Respond like a pirate"
    And the sent prompt's user message contains "Repository: stash-stack"
    And the sent prompt's user message contains "Suggested scope:"

  Scenario: Cancelling a stuck generation stops it cleanly
    Given the AI provider is pointed at a fake server that never responds
    When I select the working-tree changes in the graph
    And I click the commit-generate button
    Then the generate button shows a stop state
    When I click the commit-generate button
    Then the commit message input is enabled again
