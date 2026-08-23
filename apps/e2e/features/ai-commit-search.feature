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

  @doc @screenshots
  Scenario: Quick mode shortlists by message before reading any code
    Quick search narrows twice before opening a single diff: one call over every commit's message
    picks which commits are worth opening, then one call per shortlisted commit picks which of its
    files are, and only those are read in the code. Faster by an order of magnitude — the trade is
    that a commit or file the messages and paths never pointed at is never opened, which the badge
    on the answer says plainly.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I check out the "feature/login" branch
    And I open the AI commit search panel
    And I turn on quick commit search
    And I ask the commit search "Has the login screen been added recently?"
    Then the commit search cites the commit "feat: add login screen"
    And the commit search shows the quick-mode badge
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-commit-search-quick"

  @doc @screenshots
  Scenario: Reopening a past search restores its own question, without asking again
    Every search this repository has been asked is kept below the results, newest first — a
    search is one model call per commit, so a question already answered shouldn't have to be paid
    for twice. Asking a new question always shows the new one; reopening an older entry swaps
    straight back to exactly what it found, with nothing spent to get there.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I check out the "feature/login" branch
    And I open the AI commit search panel
    And I ask the commit search "Has the login screen been added recently?"
    Then the commit search cites the commit "feat: add login screen"
    When I ask the commit search "What changed in the build config?"
    Then the commit search shows the asked question "What changed in the build config?"
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-commit-search-history"
    When I reopen the commit search history entry "Has the login screen been added recently?"
    Then the commit search shows the asked question "Has the login screen been added recently?"
    When I remove the commit search history entry "What changed in the build config?"
    Then the commit search history does not list "What changed in the build config?"
    When I clear the commit search history
    Then the commit search history is empty
