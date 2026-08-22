@worktree
Feature: Worktree management
  As a user working across multiple branches at once
  I want to list, add, and remove git worktrees from the sidebar
  So that I don't have to leave the app to manage them

  A linked worktree is another checkout of the same repository, on a
  different branch, in its own folder — useful for working on two things at
  once without stashing or switching. Git Manager lists, adds and removes
  them from the sidebar, without you ever leaving the app for a terminal.

  Background:
    Given the "worktree-repo" fixture repository is opened

  Scenario: The sidebar lists the repo's linked worktree
    When I expand the "worktrees" sidebar section
    Then the sidebar lists a worktree for branch "feature/login"

  @doc @screenshots
  Scenario: Adding a new worktree
    Worktrees you've linked to this repository are listed in their own
    sidebar section, so you can see every branch checked out elsewhere at a
    glance. Adding one is a small dialog: pick the branch and a folder, and
    Git Manager creates the linked worktree and lists it right away.
    Removing one works the same way in reverse — and if it still has
    uncommitted changes, the dialog warns you and requires an explicit
    force before it lets you continue.
    Given the app language is English
    And AI features are turned off
    And the "worktree-repo" fixture repository is opened
    When I expand the "worktrees" sidebar section
    And I click the add-worktree button
    And I set the worktree branch to "feature/settings"
    And I set the worktree path to a fresh temporary directory
    And I confirm the add-worktree dialog
    And the interface has settled
    Then the sidebar lists a worktree for branch "feature/settings"
    And the fixture repo has a worktree at that path on disk
    And a full-window screenshot is saved as "doc-worktree-sidebar"

  @doc @screenshots
  Scenario: Removing an existing worktree
    Removing a worktree works the same way in reverse from adding one: a click on its row in the
    sidebar opens a confirmation, since removing a worktree removes the folder it checked out —
    nothing happens until you confirm it.
    Given the app language is English
    And AI features are turned off
    And the "worktree-repo" fixture repository is opened
    When I expand the "worktrees" sidebar section
    And I click the remove button for the linked worktree
    And the interface has settled
    And a full-window screenshot is saved as "doc-worktree-remove-confirm"
    When I confirm the remove-worktree dialog
    Then the sidebar no longer lists a worktree for branch "feature/login"
    And the fixture repo no longer has the linked worktree on disk

  # The fixture is the agent's own session store: `get_worktree_agent_activity` reads
  # `$HOME/.claude/projects/<slug>/*.jsonl` and reports "working" when the newest transcript there
  # was written in the last minute, so the step fabricates one at exactly that path — inside the
  # run's isolated `$HOME` (/tmp/git-manager-e2e-home), never the developer's. See
  # worktree.steps.ts, which also cleans it up.
  @doc @screenshots @agentactivity
  Scenario: Seeing which worktree an AI coding agent is working in
    Worktrees are how you keep several things going at once, and an AI coding
    agent is one of the things that can be going on in one. When a Claude Code
    session is running in a worktree, that worktree's uncommitted-changes row in
    the graph says so: the dashed ring picks up the agent's colour and carries
    its mark instead of an avatar, with a tag beside it reading either
    **working** — output is being produced right now, and the ring pulses — or
    **idle**, meaning the session is open but waiting on you.

    Nothing is asked of the agent for this. Git Manager reads the session logs
    the agent already writes to disk, which is also why the reading is a
    reasonable guess rather than a fact: a long tool run or a long think can
    leave a gap wide enough to show as idle for a moment mid-turn, and a session
    you walked away from stops being reported after a quarter of an hour.
    Given the app language is English
    And AI features are turned off
    And the linked worktree has uncommitted changes
    And an AI coding agent is working in the linked worktree
    # After the dirty/session fixtures, not before: the Background's fixture-open step rebuilds the
    # repository from scratch, so anything written ahead of it is thrown away. Kept a `Given` so the
    # docs generator drops it — reloading is fixture plumbing, not something a reader does.
    Given I reload the application
    When I expand the "worktrees" sidebar section
    And the interface has settled
    Then the graph marks the linked worktree as having an agent at work
    And a full-window screenshot is saved as "doc-worktree-agent-activity"

  @doc @screenshots
  Scenario: Removing a dirty worktree requires forcing
    A worktree with uncommitted changes doesn't remove quietly: the dialog warns you first, and the
    force checkbox has to be ticked before confirming does anything — one extra, deliberate step
    for the same reason a hard reset asks for one.
    Given the app language is English
    And AI features are turned off
    And the linked worktree has uncommitted changes
    When I reload the application
    And I expand the "worktrees" sidebar section
    And I click the remove button for the linked worktree
    Then the remove-worktree dialog warns about uncommitted changes
    And the interface has settled
    And a full-window screenshot is saved as "doc-worktree-remove-dirty"
    When I check the force-remove checkbox
    And I confirm the remove-worktree dialog
    Then the fixture repo no longer has the linked worktree on disk
