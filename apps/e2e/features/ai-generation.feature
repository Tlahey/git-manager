@ai
Feature: AI commit-message generation
  As a user with staged changes
  I want an AI-drafted commit message
  So that I don't have to write it by hand

  Every AI feature runs against the provider you've configured in Settings
  — a local Ollama by default. Generating commit batches asks for a whole
  reviewable plan, splitting your working tree into several commits at
  once, each with its own editable message and file list.

  Background:
    Given the "stash-stack" fixture repository is opened

  @doc @screenshots
  Scenario: Generating a commit message summarizes every staged file, then drafts one from all of them
    Every staged file is summarized first, one call each, before a single composing
    call writes the message — so a change spanning several files gets a subject
    describing the whole thing rather than whichever file happened to be read
    first. The same button doubles as Stop while a generation is running, so a
    generation that seems stuck can be cancelled without waiting it out.
    Given the app language is English
    And the AI provider is pointed at a fake server
    When I select the working-tree changes in the graph
    And I click the commit-generate button
    And the interface has settled
    Then the commit message becomes "feat: add fake thing"
    And a full-window screenshot is saved as "doc-ai-commit-message"

  Scenario: Generating a commit message sends the map-then-compose prompt
    Given the AI provider is pointed at a fake server
    When I select the working-tree changes in the graph
    And I click the commit-generate button
    Then the commit message becomes "feat: add fake thing"
    And the sent prompt's system message contains "Conventional Commits"
    And the sent prompt's user message contains "Repository: stash-stack"
    And the sent prompt's user message contains "All 1 staged files:"

  @doc @screenshots
  Scenario: Generating commit batches proposes a reviewable plan and applies the accepted commits
    A working tree that mixes more than one logical change together
    doesn't have to become one lumped commit: generating commit batches
    asks the AI to split it into a reviewable plan instead of a single
    message, with each proposed commit getting its own editable message
    and file list so you can adjust anything before committing. Accepting
    the plan applies every proposed commit in order, exactly as shown.
    Given the app language is English
    And the AI provider is pointed at a fake server
    When I select the working-tree changes in the graph
    And I click the generate-commit-batches button
    And the interface has settled
    Then the AI batch dialog proposes a first commit "feat: grouped changes"
    And a full-window screenshot is saved as "doc-ai-commit-batches"
    When I apply the AI commit batch
    Then the repository HEAD commit subject is "feat: grouped changes"

  Scenario: Cancelling a stuck generation stops it cleanly
    Given the AI provider is pointed at a fake server that never responds
    When I select the working-tree changes in the graph
    And I click the commit-generate button
    Then the generate button shows a stop state
    When I click the commit-generate button
    Then the commit message input is enabled again
