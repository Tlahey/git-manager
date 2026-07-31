@ai
Feature: AI code review

  As a developer about to open a PR, or just before committing
  I want the model to flag anything worth a second look
  So that I catch issues before a human reviewer does

  This is the one AI feature explicitly allowed an opinion — every explanation feature is told not
  to have one, and this one is told the opposite: read the diff and flag what deserves a second
  look. It only ever sees the diff, so its findings are a prompt to check, not a verdict.

  @doc @screenshots
  Scenario: Reviewing the working changes
    Choosing "Review changes (LLM)" on the working-tree row reads everything you haven't committed
    yet and reviews it in the same right panel the explanations use. Like the working explanation,
    nothing is remembered — the tree moves constantly, so every open reviews fresh.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "stash-stack" fixture repository is opened
    When I choose "Review changes (LLM)" from the working-tree row menu
    Then the explanation panel shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-review-working"

  @doc @screenshots
  Scenario: Reviewing a branch's range diff
    Choosing "Review branch changes (LLM)" reads the whole range between a branch and its base —
    the same comparison the branch explanation uses — and reviews it before you open a PR. The
    review is remembered per branch, same as the branch explanation.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I choose "Review branch changes (LLM)" for the "feature/login" branch (base "main")
    Then the explanation panel shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-review-branch"
