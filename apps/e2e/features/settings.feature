@settings
Feature: Settings
  As a user
  I want to open the settings and have them laid out correctly
  So that I can configure the app

  Scenario: The settings screen opens on the general section
    Given the git-manager application is running
    When I open the settings
    Then the settings screen is shown
    And the general settings tab is available

  @visual
  Scenario: The settings screen matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    Then the settings screen matches the visual snapshot "settings-general"

  @visual
  Scenario: The notifications section matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    And I open the "notifications" settings tab
    Then the settings screen matches the visual snapshot "settings-notifications"

  Scenario: Toggling the row height setting persists across a reload
    Given the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I select the "small" row height
    And I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the row height setting is "small"

  Scenario: Testing the AI provider connection reports a definitive status
    Given the git-manager application is running
    When I open the settings
    And I open the "local_ai" settings tab
    And I click the AI provider test connection button
    Then the AI provider connection status is reported

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

  Scenario: Toggling the rewards setting persists across a reload
    Given the git-manager application is running
    When I open the settings
    And I open the "rewards" settings tab
    And I toggle the rewards setting off
    And I reload the application
    And I open the settings
    And I open the "rewards" settings tab
    Then the rewards setting is "off"

  Scenario: Generating a new SSH key pair writes real key files to disk
    Given the git-manager application is running
    When I open the settings
    And I open the "ssh" settings tab
    And I open the SSH key generator
    And I set the SSH key generation path to a temporary location
    And I click the generate SSH key button
    Then the generated SSH public key is shown
    And a real SSH key pair exists at the generated path

  Scenario: Selecting a built-in theme applies it and persists across a reload
    Given the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I select the "light" theme
    Then the active theme is "light"
    When I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the active theme is "light"
    When I select the "dark" theme
    Then the active theme is "dark"

  @visual
  Scenario: The dark theme card matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    # Select it here rather than inheriting whatever the previous scenario left persisted: the card
    # draws a blue ring when its theme is the active one, and on a card this small that ring alone
    # is ~3% of the pixels — more than enough to fail the 1% threshold. Selecting explicitly also
    # rules out snapshotting before the persisted settings have rehydrated after the reload.
    And I select the "dark" theme
    Then the active theme is "dark"
    And the "dark" theme card matches the visual snapshot "theme-card-dark"

  Scenario: Starting the GitHub OAuth device flow shows a real device code, and it can be cancelled
    Given the git-manager application is running
    When I open the settings
    And I open the "integrations" settings tab
    And I click the GitHub OAuth login button
    Then the GitHub device code and activation link are shown
    When I cancel the GitHub OAuth login
    Then the GitHub login options are shown again
