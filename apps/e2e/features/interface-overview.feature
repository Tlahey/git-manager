@interface
Feature: The interface at a glance
  As a user opening the app for the first time
  I want to know what each fixed part of the window is for
  So that I can find my way before learning any single feature

  Around whatever repository you are working on, the window keeps three fixed
  landmarks: the tab bar along the top, the action toolbar under it, and the
  status footer along the bottom. Everything else — graph, staging, panels —
  lives in the space between them and changes with what you are doing; these
  three do not.

  @doc @screenshots
  Scenario: The tab bar keeps every repository one click away
    The top strip works like a browser's tab bar: the Dashboard keeps a pinned
    tab on the far left, and every repository you open gets a tab of its own,
    so switching projects is one click and no repository is ever closed just
    because you looked at another one. Open a fresh tab with ⌘T, close the
    current one with ⌥W.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    And the interface has settled
    Then the tab bar shows a tab for the "feature-branches" repository
    And a screenshot of the "tab-bar" area is saved as "doc-tab-bar"

  @doc @screenshots
  Scenario: The toolbar carries the day-to-day Git actions
    Under the tabs, the toolbar is where the everyday Git verbs live: the
    repository and branch selectors on the left tell you where you are, and
    Fetch, Pull and Push sit right next to them — with badges counting what is
    waiting in each direction, so you know there is something to pull before
    you ask.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    And the interface has settled
    Then the toolbar offers the fetch, pull and push actions
    And a screenshot of the "action-toolbar" area is saved as "doc-action-toolbar"

  @doc @screenshots
  Scenario: The footer keeps an eye on the background
    The bottom strip is the app's quiet status line: it names the branch you
    are on, opens the activity logs — every Git operation the app ran on your
    behalf, with its result — and reports whether your AI provider is
    reachable, checking, or busy generating something for a panel you may have
    scrolled away from.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    And the interface has settled
    Then the footer reports the AI provider status
    And a screenshot of the "app-footer" area is saved as "doc-app-footer"

  @doc @screenshots
  Scenario: Searching the in-app keyboard shortcuts reference
    The footer's keyboard icon opens the same shortcuts this page lists, searchable by what they
    do or by the keys themselves — so "undo" finds ⌘Z without having to already know which
    category it's filed under.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    When I open the keyboard shortcuts panel
    And I search the shortcuts panel for "undo"
    Then the shortcuts panel shows the shortcut "Undo the last Git action"
    And the shortcuts panel does not show the shortcut "Open Settings"
    And the interface has settled
    And a full-window screenshot is saved as "doc-keyboard-shortcuts"
