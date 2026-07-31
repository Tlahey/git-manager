@ai
Feature: Explaining what changed

  As a developer looking at a commit, a branch, or my own uncommitted work
  I want a plain-language reading of what actually changed
  So that I don't have to reconstruct it from the diff myself

  "Explain (LLM)" shows up in four places — a commit, a branch, your uncommitted work, and one
  file's pending diff — and they all answer the same question at a different scope: not what the
  message says, but what the change actually does. The three panel-based ones (commit, branch,
  working tree) share one instruction and one right-hand panel; the file one is scoped tighter, and
  reads against the file's own content, not just the patch.

  @doc @screenshots
  Scenario: Explaining a single commit
    Choosing "Explain this commit (LLM)" opens the commit summary in the right panel and starts
    generating immediately — no second click needed, since picking the menu item already is the
    request. The explanation is remembered per commit afterwards: reopening the panel for the same
    commit shows it again straight away instead of regenerating.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I select the "HEAD" commit in the graph
    And I choose "Explain this commit (LLM)" from the commit's row menu
    Then the explanation panel shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-commit-explanation"

  @doc @screenshots
  Scenario: Explaining a branch's changes
    Choosing "Explain branch changes (LLM)" summarizes everything the branch adds compared to its
    base — resolved from local refs alone, so it works with no remote and no GitHub token. Like the
    commit summary, it is remembered per branch and shown again on reopening rather than regenerated.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I choose "Explain branch changes (LLM)" for the "feature/login" branch (base "main")
    Then the explanation panel shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-branch-explanation"

  @doc @screenshots
  Scenario: Explaining all uncommitted changes
    Choosing "Explain working changes (LLM)" on the working-tree row summarizes everything you
    haven't committed yet — every changed file, not just whichever one happens to be open. Unlike
    the commit and branch summaries it keeps no memory: the working tree moves constantly, so every
    open generates fresh.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "stash-stack" fixture repository is opened
    When I choose "Explain working changes (LLM)" from the working-tree row menu
    Then the explanation panel shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-working-explanation"

  @doc @screenshots
  Scenario: Explaining one file's pending diff
    The Explain button above the diff editor answers a narrower question than the panels above: what
    does this one pending change do to this file, read against the file's own current content, not
    just the +/- lines of the patch. Nothing runs until you ask for it.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I open the diff for "config.yml"
    And I click the explain-changes button
    Then the change explanation shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-change-explanation"
