---
title: 'Troubleshooting'
description: 'First-launch blocks, an unreachable AI provider, where the logs live — the short answers.'
---

# Troubleshooting

## macOS refuses to open the app the first time

If macOS reports the app "cannot be opened" on first launch, right-click the app in
`Applications` and choose **Open** once — macOS remembers the choice afterwards. This is
Gatekeeper's standard prompt for apps downloaded outside the App Store, not a fault in the
download; see [Download & Install](./download) for where releases come from.

## The footer says the AI provider is unreachable

The app checks your configured AI endpoint at startup and shows a footer pill with the result.
"Disconnected" means nothing answered at the configured URL — with the default setup that means
Ollama isn't running. [Set up your AI provider](./ai-setup) covers the two-command fix, and the
**Test connection** button in Settings → AI re-checks on demand. Every non-AI feature works
regardless.

## Something went wrong — where are the logs?

The footer's activity button opens the **activity log**: every Git operation the app ran on your
behalf, with its arguments, result and timing — the first place to look when an action didn't do
what you expected. The [activity log page](./features/activity-log) shows how to filter it to
errors only, and the same screen can reveal the on-disk log files to attach to a bug report.

## A commit or push was refused

If your repository installs hooks (pre-commit, commit-msg, pre-push), they run here exactly as
they do on the command line — a refusal shows the hook's own output, and the commit button's
menu offers a one-time "without hooks" escape hatch. See [Repository hooks](./features/git-hooks).

## Still stuck?

[Open an issue](https://github.com/Tlahey/git-manager/issues) with the app version (bottom-right
of the footer) and, if it concerns a Git operation, the matching activity-log entry.
