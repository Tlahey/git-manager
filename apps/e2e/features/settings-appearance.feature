@settings
Feature: Appearance

  The appearance tab is where the app's look lives: which built-in theme is active, the application
  icon macOS shows for it, and any custom theme dropped in by hand.

  @doc @screenshots
  Scenario: Selecting a built-in theme applies it and persists across a reload
    Every built-in theme lives in the appearance tab as a card you can
    preview and pick. Selecting one applies immediately — no confirm step —
    and it is still the active theme the next time the app opens, reload
    or restart included.
    Given the app language is English
    And AI features are turned off
    And the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I select the "light" theme
    Then the active theme is "light"
    When I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the active theme is "light"
    When I select the "dark" theme
    And the interface has settled
    Then the active theme is "dark"
    And a full-window screenshot is saved as "doc-settings-theme"

  # The icon the app wears in the Dock is a setting like any other, and the only part of it this
  # suite can see is the setting: WebDriver captures the webview, never the Dock. So this asserts the
  # picked card is the selected one and that it still is after a reload — the same shape as the row
  # height and the theme — and puts the default back at the end, since the choice outlives the
  # scenario the way the theme's would.
  Scenario: Choosing another application icon keeps it across a reload
    Given the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I select the "line" application icon
    Then the "line" application icon is selected
    When I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the "line" application icon is selected
    When I select the "default" application icon
    Then the "default" application icon is selected
    And no error notification is displayed

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

  @doc @screenshots
  Scenario: Customizing the integrated terminal's background and text colors
    The terminal's background and text are their own pair of colour pickers, independent of
    whichever theme is active — a live preview updates as soon as either changes, and Reset puts
    both back to the app's own defaults in one click.
    Given the app language is English
    And AI features are turned off
    And the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I set the terminal background color to "#1a2b3c"
    And I set the terminal foreground color to "#ffcc00"
    Then the terminal background color is "#1a2b3c"
    And the terminal foreground color is "#ffcc00"
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-terminal-colors"
    When I reset the terminal colors
    Then the terminal background color is "#000000"
    And the terminal foreground color is "#e4e4e7"

  @doc @screenshots
  Scenario: A theme dropped into the themes folder shows up alongside the built-in ones
    Themes are not limited to the ones that ship with the app: any `.css` file
    placed in `~/.git-manager/themes` becomes a theme of its own, named after
    the file, listed with the built-in ones and applied the same way. The file
    holds plain CSS variables — the app wraps them in the right selector — so a
    palette you like is a few lines and a restart-free reload away.
    Given the app language is English
    And a user theme file named "e2e-midnight" exists
    # The user-themes list is fetched behind a 60s SWR dedupe key (`useUserThemes.ts`) — a reload
    # forces a fresh mount and a fresh fetch, rather than trusting whatever another scenario's
    # fetch of the same key happened to leave cached, however long ago that ran.
    When I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the theme "e2e-midnight" is offered
    When I select the "e2e-midnight" theme
    Then the active theme is "e2e-midnight"
    And the interface has settled
    And a full-window screenshot is saved as "doc-user-theme"
