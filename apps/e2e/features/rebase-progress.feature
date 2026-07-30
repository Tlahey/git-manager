@rebase @conflict
Feature: Rebase progress view
  As a user whose rebase paused mid-plan
  I want the content view to show where I am in that plan
  So that I can see what's been replayed, what stopped it, and what's still ahead

  A rebase that replays several commits doesn't just show you the one that
  stopped it: the whole plan takes over the content view as a step rail, so
  you can see what's already landed, what's still ahead, and exactly where
  you are between the two.

  # The multi-step fixture stops on step 2 of 6, so there's a replayed step above the pause and
  # four still ahead — the rebase-conflict fixture only ever has one step and can't show a rail.
  Background:
    Given the "rebase-multi-step" fixture repository is opened

  @doc @screenshots
  Scenario: A paused rebase takes over the content view with its step rail
    A multi-step rebase that pauses doesn't just show the one commit that
    stopped it — the content view swaps to a step rail listing the whole
    plan: which commits have already been replayed, which one stopped it,
    and which are still ahead. Hiding the rail to look at something else
    doesn't lose your place, either: the graph banners the paused rebase,
    and clicking that banner brings the rail straight back. Continuing from
    here advances to the next step, which may pause again further down the
    plan or finish the rebase outright.
    Given the app language is English
    And AI features are turned off
    And the "rebase-multi-step" fixture repository is opened
    When the interface has settled
    Then the rebase progress view is shown
    And the rebase progress view reports "Step 2 of 6"
    And the rebase progress view is rebasing "feature/tuning" onto "main"
    And the commit graph is not shown
    And a full-window screenshot is saved as "doc-rebase-progress"

  Scenario: The rail marks what has been replayed, what stopped, and what is still ahead
    Then the rebase progress view is shown
    And rebase step 1 is marked "done"
    And rebase step 2 is marked "current"
    And rebase step 3 is marked "pending"
    And rebase step 2 says "Stopped here — 1 file left to resolve"

  @visual
  Scenario: The rebase progress view matches the reference snapshot
    Then the rebase progress view matches the visual snapshot "rebase-progress-view"

  Scenario: Hiding the view returns the commit graph, still bannered with the rebase
    Then the rebase progress view is shown
    When I hide the rebase progress view
    Then the rebase progress view is not shown
    And the commit graph is shown
    And the graph banners the paused rebase

  Scenario: Clicking the graph banner brings the progress view back
    When I hide the rebase progress view
    And I click the paused-rebase banner in the graph
    Then the rebase progress view is shown

  # Regression: the banner used to run through the graph's row-select handler, which *toggles* the
  # CONFLICT row — so clicking it while that row was already selected (the normal state during a
  # pause) cleared the selection and closed the conflicted-files panel the click was meant to open.
  Scenario: Clicking the graph banner opens the files panel instead of closing it
    Then the conflict resolution panel is shown
    When I hide the rebase progress view
    And I click the paused-rebase banner in the graph
    Then the rebase progress view is shown
    And the conflict resolution panel is shown

  # Regression: clicking the step being resolved used to select that commit, swapping the right
  # panel to its "commit details" — the one panel that can't resolve anything.
  Scenario: Clicking the step being resolved shows the files to resolve, not commit details
    When I toggle the conflicted files panel
    Then the conflict resolution panel is not shown
    When I click rebase step 2
    Then the conflict resolution panel is shown
    And the commit details panel is not shown

  Scenario: The files panel can be hidden and brought back from the header toggle
    Then the conflict resolution panel is shown
    When I toggle the conflicted files panel
    Then the conflict resolution panel is not shown
    And the rebase progress view is shown
    When I toggle the conflicted files panel
    Then the conflict resolution panel is shown

  Scenario: Continuing from the progress view advances the rebase to the next step
    Given the conflicted "settings.conf" is resolved on disk
    When I reload the application
    Then the rebase progress view is shown
    When I continue the rebase from the progress view
    # Step 3 collides with nothing, but step 4's changelog edit does — the rebase stops again
    # further down the plan, which is exactly what the rail is for.
    Then the rebase progress view reports "Step 4 of 6"
    And rebase step 2 is marked "done"

  Scenario: Aborting from the progress view ends the rebase and restores the graph
    When I abort the rebase from the progress view
    Then the rebase progress view is not shown
    And the commit graph is shown
    And the repository HEAD commit subject contains "chore: leftover scratch setting"
