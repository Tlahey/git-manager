@settings @ai
Feature: AI provider

  The AI provider tab is where a model gets configured: which one, at what URL, and how large a
  context window it's trusted to hold — the one setting nothing in the protocol lets the app verify
  on its own, unlike the connection itself.

  @doc @screenshots
  Scenario: Testing the AI provider connection reports a definitive status
    "Test Connection" is a real, one-shot check against the URL above it — not a shortcut that
    just assumes the provider is reachable because a model id is filled in. It reports one of two
    definite outcomes, connected or not, rather than leaving the field in limbo while you wait to
    find out the hard way, the next time a feature tries to call the model and fails.
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    And I click the AI provider test connection button
    Then the AI provider connection status is reported
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-ai-connection"

  @doc @screenshots
  Scenario: Checking a declared context window against what the model actually serves
    The context-window field is the one AI setting taken purely on faith — nothing in the protocol
    lets the app ask a provider directly what it will serve. "Check against the model" asks
    anyway, when the provider is willing to answer, and offers to raise the declared value in one
    click when the server serves far more than what's set — the default 4096 in front of a
    128,000-token model being exactly the case this exists for.
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    And I click the AI context window check button
    Then the context window check reports that the model serves 128000 tokens
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-context-check"
    When I apply the suggested context window
    Then the context window setting is "128000"

  @doc @screenshots
  Scenario: The AI provider dropdown offers Ollama and the generic OpenAI-compatible entry
    Every AI feature runs against whichever provider is picked here — Ollama, for a fully local
    model with nothing leaving the machine, or the generic OpenAI-compatible entry for any other
    server that speaks the same protocol, self-hosted or not. Neither is a named cloud vendor:
    what each one talks to is the URL typed in below it, not a fixed address the app already knows.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    Then the "ollama" AI provider option is enabled
    And the "openai-compatible" AI provider option is enabled
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-ai-providers"

  Scenario: Turning AI off hides the whole provider configuration
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    And I toggle the AI setting off
    Then the AI provider configuration is hidden
