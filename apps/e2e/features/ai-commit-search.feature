@ai
Feature: Semantic commit search

  As a developer trying to remember when something changed
  I want to ask a question and get an answer read from the actual commits
  So that I find things by what they did, not by what they were named

  Opened from the AI menu's "Search history with a question" (or ⇧⌘F), this reads a window of
  history commit by commit against your question, then answers from what actually matched — never
  from commit messages alone. Each commit the answer cites is a real, opened diff, not a keyword
  match on its subject line: a commit named "fix stuff" that actually touched the thing you asked
  about is found, and a commit whose name merely sounds related but changed something else is not.

  @doc @screenshots
  Scenario: Answering a question from the commit history
    Asking a question reads every commit in the window file by file — the default "deep" mode,
    which is what makes this different from a plain `git log --grep`. The answer cites the specific
    commits it rests on, each opening straight to its own diff.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I check out the "feature/login" branch
    And I open the AI commit search panel
    And I ask the commit search "Has the login screen been added recently?"
    Then the commit search cites the commit "feat: add login screen"
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-commit-search"
