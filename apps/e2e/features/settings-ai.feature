@settings @ai
Feature: AI provider

  The AI provider tab is where a model gets configured: which one, at what URL, and how large a
  context window it's trusted to hold — the one setting nothing in the protocol lets the app verify
  on its own, unlike the connection itself.

  Scenario: Testing the AI provider connection reports a definitive status
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    And I click the AI provider test connection button
    Then the AI provider connection status is reported

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

  Scenario: The AI provider dropdown offers Ollama and the generic OpenAI-compatible entry
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    Then the "ollama" AI provider option is enabled
    And the "openai-compatible" AI provider option is enabled

  Scenario: Turning AI off hides the whole provider configuration
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    And I toggle the AI setting off
    Then the AI provider configuration is hidden
