@settings
Feature: General

  As a user
  I want to open the settings and have them laid out correctly
  So that I can configure the app

  Settings opens as a full-screen overlay from anywhere in the app (⌘, on macOS) rather than a
  separate window, with sections down the side: general, AI, notifications, SSH, appearance and
  more — each covered on its own page (see the Settings group's other entries). Whatever you change
  is saved immediately and survives a reload — there is no explicit "save" button to remember.

  Scenario: The settings screen opens on the general section
    Given the git-manager application is running
    When I open the settings
    Then the settings screen is shown
    And the general settings tab is available

  @visual
  # Opens the tab explicitly rather than trusting the default: the suite reuses one app instance,
  # so whichever section the previous scenario — or the previous *run* — left selected is still
  # selected here, and the sidebar's highlight is part of the snapshot.
  Scenario: The settings screen matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    And I open the "general" settings tab
    Then the settings screen matches the visual snapshot "settings-general"

  @visual
  Scenario: The notifications section matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    And I open the "notifications" settings tab
    Then the settings screen matches the visual snapshot "settings-notifications"

  @doc @screenshots
  Scenario: Configuring background auto-fetch
    The app quietly re-fetches the active repository on a timer of its own, even while the window
    doesn't have focus — useful for a repository left open and unattended, so a branch that moved
    upstream surfaces on its own instead of waiting for a manual Fetch. Turning the interval to 0
    disables it; whether that automatic fetch also prunes gone-remote branches is a separate
    choice, independent of what a manual fetch does.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "general" settings tab
    And I set the auto-fetch interval to "5" minutes
    And I turn off automatic pruning on auto-fetch
    And I reload the application
    And I open the settings
    And I open the "general" settings tab
    Then the auto-fetch interval is "5" minutes
    And automatic pruning on auto-fetch is off
    And the interface has settled
    And a full-window screenshot is saved as "doc-auto-fetch"

  @doc @screenshots
  Scenario: Configuring git identity, graph loading, and index scan settings persists across a reload
    The General section covers more than the toggles above: the name and email new commits are
    authored as, how many commits the graph loads up front (and whether it keeps lazily loading
    past that), and which paths the workspace-wide file scan skips and how deep it descends. All of
    it is saved the same way as everything else here — immediately, with nothing to click to commit
    it — and the app's own configuration file is shown at the bottom for whoever wants to look at
    what got written.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "general" settings tab
    And I set the git identity name to "Ada Lovelace"
    And I set the git identity email to "ada@example.com"
    And I set the initial graph commit count to "1500"
    And I turn off lazy-loading graph commits
    And I add "coverage" to the scan exclusions
    And I set the max scan depth to "5"
    And I reload the application
    And I open the settings
    And I open the "general" settings tab
    Then the git identity name is "Ada Lovelace"
    And the git identity email is "ada@example.com"
    And the initial graph commit count is "1500"
    And lazy-loading graph commits is off
    And the scan exclusions include "coverage"
    And the max scan depth is "5"
    And the app configuration file setting is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-general-git-scan"

  @doc @screenshots
  Scenario: Toggling the row height setting persists across a reload
    A denser graph fits more history on screen at once; the choice is remembered the same way
    every other setting is, reload and restart included.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I select the "small" row height
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-row-height"
    And I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the row height setting is "small"

  @doc @screenshots
  Scenario: Toggling the rewards setting persists across a reload
    The achievements-and-rewards layer — themes and gamification unlocked by using the app — is
    entirely optional; turning it off is a real setting, not just hiding the trophy page, and it
    stays off across a reload the same way any other choice here does.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "rewards" settings tab
    And I toggle the rewards setting off
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-rewards"
    And I reload the application
    And I open the settings
    And I open the "rewards" settings tab
    Then the rewards setting is "off"

  @doc @screenshots
  Scenario: Switching the interface language takes effect immediately
    The language dropdown at the top of the General section drives the same i18next instance
    every screen renders through, so picking a new language re-renders the whole app's copy on
    the spot — no reload, no restart.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "general" settings tab
    Then the interface language label reads "Interface language"
    When I select "French" as the interface language
    Then the interface language label reads "Langue de l'interface"
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-language"
    When I select "English" as the interface language
    Then the interface language label reads "Interface language"

  @doc @screenshots
  Scenario: Searching settings filters the side panel to matching sections
    Every section is reachable by more than its label — the search box also matches each
    section's localized keyword synonyms, so typing what you're trying to do ("terminal")
    surfaces the section that handles it even when its own name doesn't say so.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I search settings for "terminal"
    Then the "ui_customization" settings tab is shown
    And the "notifications" settings tab is not shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-search"
    When I search settings for ""

  @doc @screenshots
  Scenario: The Support tab links to GitHub Sponsors
    Settings has one, single ask: a Support tab with a button to back the project on GitHub
    Sponsors, pinned at the bottom of the side panel below every configuration section.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "support" settings tab
    Then the sponsor button is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-support"

  @doc @screenshots
  Scenario: The current version and an update check sit below every settings tab
    Pinned at the very bottom of the side panel, below every section and the Support link, is the
    app's own version and a button to check for a newer one — reachable whichever tab is open,
    since it's the one thing that never depends on what you're configuring. An update, once found,
    downloads and installs in place, ending in a one-click restart.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    Then the current app version is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-updater"

  @doc @screenshots
  Scenario: The changelog tab lists recent release entries
    Settings → Changelog renders the project's own release notes — the same file published with
    every release — so what changed and when is one click away, without leaving the app.
    Given the app language is English
    And the git-manager application is running
    When I open the settings
    And I open the "changelog" settings tab
    Then the changelog shows at least one release entry
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-changelog"
