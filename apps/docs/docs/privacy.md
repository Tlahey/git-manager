---
title: 'Private by design'
description: 'Everything runs on your machine. The complete list of what ever leaves it — and how to turn each item off.'
---

# Private by design

Git Manager is a local application, not a client for a service. There is no account, no
telemetry, no analytics and no automatic crash reporting — nothing about you, your repositories
or your usage is collected or sent anywhere on its own. Your repositories are read with an
embedded Git implementation, on disk, and everything you see is computed on your machine.

When something breaks you can [report it](./features/error-report), and that is the one case
where the app helps you send something — but only ever because you clicked, after reading the
exact text that will be posted. See [Reporting a problem](#reporting-a-problem) below.

## The complete list of what can leave your machine

Four things — each visible, each under your control:

| Traffic            | Where it goes                                                                                                           | When                                  | Turn it off                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| **AI requests**    | The provider **you** configured — `http://localhost:11434` (Ollama) by default, so by default not even off your machine | Only when you use an AI feature       | Settings → AI → disable, or never configure a remote endpoint  |
| **GitHub**         | `github.com` (OAuth device flow, pull requests, issues, avatars)                                                        | Only if you connect a GitHub account  | Don't connect one — every Git feature works without it         |
| **Update check**   | This project's GitHub Releases (`latest.json`)                                                                          | On launch, to offer updates           | —                                                              |
| **Problem report** | This project's issue tracker, as an issue posted by **you**                                                             | Only when you write one and submit it | Don't send it — the report is shown to you first, never before |

Ordinary Git network operations — fetch, pull, push, clone — of course talk to **your** remotes,
exactly like the `git` command line would, using your own SSH keys or tokens.

## Where your data lives

- **Repositories** stay exactly where they are — the app never copies or uploads them.
- **Settings, tabs, pins, achievements** live in local application storage on your machine.
- **Daily briefings** (the AI morning summaries) are Markdown files under `~/.git-manager/summaries/` —
  yours to read, back up or delete.
- **Activity logs** (every Git operation the app ran, with its result) are local files, one click
  away from the footer.

## Reporting a problem

The app can turn a failure into an issue on its own tracker, so that a bug you hit can be fixed.
It is worth being precise about what that does and does not mean.

- **It never sends anything on its own.** There is no background reporting and no "send
  diagnostics" setting. A report exists only after you open it, and leaves only after you submit
  it.
- **You see the exact text first.** The dialog shows the complete issue body, and you can copy it
  out and edit it before posting. That preview is not a formality — it is your last look.
- **The identifying parts are removed before you even see it.** Absolute paths (which contain your
  username), the repository's path and name, branch names, and anything shaped like a token or a
  key. Command arguments are reduced to their _shape_: `branch:string(25)` rather than the branch
  name.
- **It is posted by you, under your own GitHub account** — which means your GitHub username is
  public on that issue, like any issue you open by hand. Without a connected account the app posts
  nothing at all: it shows you the report and a link, and you file it yourself.
- **AI transcripts are never included.** They are kept in a separate log for exactly this reason —
  they contain your source code.

[Reporting a problem](./features/error-report) walks through the screen.

## Credentials never reach the interface

SSH keys and HTTPS tokens are handled exclusively by the native (Rust) side of the app. They are
never passed into the interface layer, never logged, and never included in anything an AI
feature sends to your provider.
