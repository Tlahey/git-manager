@notifications
Feature: Notifications
  As a user
  I want to see and manage PR notifications from the bell dropdown
  So that I don't miss review requests or merges

  Git Manager tells you about things twice, and the two are not the same. What
  happens while you watch — a fetch finishing, a hook refusing a commit, a clone
  counting up — arrives as a card that slides down from the top of the screen and
  leaves on its own. What happened to your pull requests while you were elsewhere
  is collected in the bell in the toolbar, and stays there until you deal with it.

  Background:
    Given the notification tray is seeded with sample notifications

  @doc @screenshots
  Scenario: The bell collects what happened while you were away
    The bell in the toolbar carries an unread count, and opening it lists what
    came in — a review request, a merge, whatever the connected GitHub account
    has seen. Marking everything read clears the count without removing the
    notifications; clearing empties the tray outright.
    Given the app language is English
    When I open the notification tray
    And the interface has settled
    Then the notification tray shows 2 notifications
    And the notification unread badge reads "1"
    And a full-window screenshot is saved as "doc-notifications"

  @doc @screenshots
  Scenario: Marking all as read clears the unread badge
    "Mark all as read" clears the count without touching the list itself — the notifications you
    haven't dealt with are still there to scroll back through, just no longer flagged as new.
    Given the app language is English
    When I open the notification tray
    And I mark all notifications as read
    Then the notification unread badge is not shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-notifications-marked-read"

  @doc @screenshots
  Scenario: Clearing all notifications empties the tray
    "Clear all" is the other one: it empties the tray outright, for once everything in it has
    genuinely been dealt with and there's nothing left worth scrolling back to.
    Given the app language is English
    When I open the notification tray
    And I clear all notifications
    Then the notification tray is empty
    And the interface has settled
    And a full-window screenshot is saved as "doc-notifications-cleared"

  @doc @screenshots
  Scenario: Choosing where notifications appear
    Settings → Notifications decides where the app talks to you. Its own card is
    the default: it slides down from the notch at the top of the screen, sits over
    the menu bar, and goes away by itself after however long you pick here — or
    stays until you close it, if that is what you choose. Hovering it holds it
    open, clicking it brings the app forward on whatever it was about.

    macOS banners are the alternative, and the choice is not only cosmetic —
    which is why each option carries a line explaining itself. A banner is a
    single line, written once, that ends up in Notification Centre and stays
    there. Anything that keeps changing while it runs has nowhere to go in one:
    pick banners and progress cards, background-task cards and the running-hook
    card are not raised at all, rather than being flattened into forty banners
    for one operation. The card is the surface that can carry them.

    Because the card is the app's own surface, it can hold more than a line. A
    `pre-commit` hook that refuses a commit comes back with the tail of what the
    hook itself printed — "a hook refused" tells you nothing you can act on, the
    lines it wrote name the file and the rule. When several things happen at once
    the cards queue rather than pile up, and one that is still working — a clone
    counting towards 100 % — is updated in place rather than torn down and
    redrawn.

    Under the picker, one switch per event decides what is worth interrupting you
    for in the first place — fetch, pull and push on the local side, then the pull
    request lifecycle from opened through review and CI to merged. One switch at
    the bottom plays a sound with whichever of them survive that list; it is off
    until you ask for it.
    Given the app language is English
    And notifications are turned on
    When I open the settings
    And I open the "notifications" settings tab
    And the interface has settled
    Then the notification display options offer the notch card and the macOS banner
    And the notification settings offer a switch per event
    And a full-window screenshot is saved as "doc-notification-delivery"

  # ── Why there is no screenshot OF the notch card ─────────────────────────────
  # Tried, twice, and measured — before adding a third attempt, read this.
  #
  # A scenario that lets a real card paint is easy to write: re-enable notifications *after* the
  # fixture-open step (which reloads and would wipe the patch), pin the card open with
  # `displayDurationMs: 0` so the capture cannot race its exit animation, and let a `pre-commit`
  # hook in the `hooks-plain` fixture refuse a commit — the richest card the app raises, and the
  # only producer this suite can trigger without a network or a clock. That part works: the card
  # is enqueued and `openNotchWindow` is called.
  #
  # Photographing it does not. Two failures, on two runs of the same scenario:
  #
  #   1. The `notch` handle registered and `switchToWindow('notch')` succeeded — and then every
  #      single `execute/sync` against it answered "No window could be found", through all of
  #      WebdriverIO's retries. The window is created `focus: false` / `decorations: false` /
  #      `skipTaskbar` and never becomes a key window, which is apparently enough for this
  #      embedded WebKit driver to refuse to run script in it. The decorated, focusable second
  #      windows this suite *does* drive (the rebase and fixup editors) are not a precedent.
  #   2. On the next run the window never opened at all. That path is worse than a failed
  #      assertion: `useNotchQueue` falls back to `apiSendNativeNotification`, so the run raises a
  #      REAL macOS banner on the machine running the suite — the exact cost `__e2eNotificationSurface`
  #      exists to avoid (see useNotchQueue.ts's e2e seam).
  #
  # And fixing the driver would not actually buy the picture, which is the part worth knowing
  # before anyone tries again. This provider captures the WEBVIEW ONLY (wdio.conf.ts's note on
  # per-provider baselines), and the notch card's whole subject is where it sits: emerging over the
  # menu bar, wrapped around the camera housing. A webview-only capture is a black rounded
  # rectangle with no screen around it — and an actively misleading one, because the card's first
  # 32 points are physically behind that housing on a notched Mac (see NotchCard.tsx's doc comment)
  # and a webview capture shows them. The `@git-manager/notch` Storybook harness draws the housing
  # *over* the card for exactly this reason; the e2e driver cannot.
  #
  # So the notch is documented by the scenario above — the setting that chooses it, captured from
  # the real Settings screen — plus this feature's own prose. A picture of the card would have to
  # come from that Storybook harness, which means a staged image in a pipeline whose whole claim is
  # that its screenshots come from a test that has to keep passing. Weighed on 2026-08-04 and
  # declined: the prose carries it. Reopen that trade if the card ever becomes hard to explain in
  # words — not because the driver got better, which would change nothing here.
