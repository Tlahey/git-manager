@ai
Feature: Recomposing a commit message

  As a developer who wrote a commit message in a hurry, or is cleaning up history before a PR
  I want the model to rewrite it from what the commit actually changed
  So that history reads accurately without me re-deriving the diff by hand

  Rewrite this commit's message (LLM) reads the commit's own diff — not its current message, which
  is withheld from the prompt on purpose, so the model describes the change instead of paraphrasing
  what is already written — and proposes a replacement. Nothing is written until you review it: the
  proposal is editable, and applying goes through a real rebase, so every commit from here to HEAD
  gets a new SHA, whether or not its message changed.

  Background:
    Given the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Recomposing a commit's message from its diff
    Selecting a commit and choosing "Rewrite this commit's message (LLM)" opens a review dialog
    with the model's proposed replacement pre-filled — editable, and not written anywhere until you
    apply it. The warning above the proposal is not decoration: rewording a commit gives every
    commit after it a new SHA too, so a branch you already pushed needs a force-push afterwards.
    Given the app language is English
    And the AI provider is pointed at a fake server
    When I select the "HEAD" commit in the graph
    And I choose "Rewrite this commit's message (LLM)" from the commit's row menu
    Then the proposed message becomes "refactor: streamline the fake commit"
    And the recompose warning about rewriting history is shown
    And a full-window screenshot is saved as "doc-ai-commit-recompose"
    When I apply the rewritten message
    Then the repository HEAD commit subject is "refactor: streamline the fake commit"
