@settings
Feature: Integrations

  The Integrations tab is where a GitHub account gets connected — the device flow or a pasted
  personal access token — so the rest of the app (Launchpad, drafting a PR, a GitHub-backed board)
  has an account to act as.

  @doc @screenshots
  Scenario: Starting the GitHub OAuth device flow shows a real device code, and it can be cancelled
    Connecting GitHub uses the same device flow GitHub's own CLI does: click Connect, get a short
    code and a link to enter it at github.com, and the app polls in the background until you do —
    no browser popup, no pasted token. Changing your mind mid-flow is one click back to the start.
    Given the app language is English
    And the git-manager application is running
    When I reload the application
    And I open the settings
    And I open the "integrations" settings tab
    And I click the GitHub OAuth login button
    Then the GitHub device code and activation link are shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-github-oauth"
    When I cancel the GitHub OAuth login
    Then the GitHub login options are shown again

  @doc @screenshots
  Scenario: Connecting GitHub with a personal access token instead
    "Login with a PAT token" is the other way in: paste a token instead of going through the
    device flow, useful on a machine where opening a browser isn't convenient. An invalid token is
    rejected with the reason GitHub gave rather than a generic failure, and "Back to options"
    returns to the choice without losing anything else on the page.
    Given the app language is English
    And the git-manager application is running
    When I reload the application
    And I open the settings
    And I open the "integrations" settings tab
    And I click the login-with-PAT button
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-github-pat"
    When I enter the PAT "not-a-real-token"
    And I submit the PAT
    Then a GitHub connection error is shown
    When I go back to the GitHub login options
    Then the GitHub login options are shown again

  @doc @screenshots @github-mock
  Scenario: Connecting GitHub with a valid personal access token
    A token GitHub actually recognizes succeeds immediately — the account appears in the list the
    moment its login is known, the same list Disconnect and every account-scoped feature (the
    Launchpad, drafting a PR, a GitHub-backed board) read from.
    Given the app language is English
    And the git-manager application is running
    When I reload the application
    And the GitHub mock server accepts the token "fake-e2e-valid-token" as "octocat"
    And I open the settings
    And I open the "integrations" settings tab
    And I click the login-with-PAT button
    When I enter the PAT "fake-e2e-valid-token"
    And I submit the PAT
    Then the GitHub account "octocat" is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-github-pat-connected"

  @doc @screenshots
  Scenario: Disconnecting a GitHub account
    Removing an account here forgets it everywhere: the entry disappears from this list and its
    token is deleted from the keychain in the same click, rather than just hiding a name the app
    still remembers. Launchpad, drafting a PR and a GitHub-backed board all lose whatever that
    account gave them access to the moment it goes.
    Given the app language is English
    And a GitHub account "octocat-e2e" is connected
    When I reload the application
    And I open the settings
    And I open the "integrations" settings tab
    Then the GitHub account "octocat-e2e" is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-github-account"
    When I disconnect the GitHub account "octocat-e2e"
    Then the GitHub account "octocat-e2e" is no longer connected
    And no error notification is displayed
