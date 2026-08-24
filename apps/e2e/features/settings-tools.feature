@settings
Feature: External tools & SSH

  Two things the app reaches for outside itself: the editor and terminal it hands work off to, and
  the SSH key it authenticates a remote with.

  @doc @screenshots
  Scenario: Pointing the app at your own editor and terminal
    External tools is where Git Manager learns which of your applications to
    hand work to: the editor that "Open in editor" actions use — from the
    dashboard's project rows to the toolbar — and the terminal that the
    toolbar's terminal shortcut and your repository tasks launch in. Both are
    picked straight from your installed applications. The terminal can stay
    unset — macOS's own Terminal is used then — while the editor button only
    appears in the toolbar once you've picked one.
    Given the app language is English
    And AI features are turned off
    And no external tools are configured
    And the "stash-stack" fixture repository is opened
    When I open the settings
    And I open the "external_tools" settings tab
    Then the external tools section offers editor and terminal pickers
    When the interface has settled
    Then a full-window screenshot is saved as "doc-external-tools"

  @doc @screenshots
  Scenario: Generating a new SSH key pair writes real key files to disk
    The SSH tab can generate a fresh Ed25519 key pair without leaving the app or opening a
    terminal — pick where it goes, and the app shells out to the real `ssh-keygen`, writing an
    actual private/public key pair to disk rather than a placeholder.
    Given the app language is English
    And the git-manager application is running
    When I reload the application
    And I open the settings
    And I open the "ssh" settings tab
    And I open the SSH key generator
    And I set the SSH key generation path to a temporary location
    And I click the generate SSH key button
    Then the generated SSH public key is shown
    And a real SSH key pair exists at the generated path
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-ssh-keygen"

  @doc
  Scenario: Browsing to an already-existing SSH key shows its public key content
    The SSH tab isn't only for generating a fresh key pair — pointing it at a key that already
    exists on disk reads and displays that key's public content the same way.
    Given the app language is English
    And an existing SSH key pair is already on disk
    And the git-manager application is running
    When I reload the application
    And I open the settings
    And I open the "ssh" settings tab
    Then the SSH public key content matches the key on disk
