---
title: 'Private by design'
description: 'Everything runs on your machine. The complete list of what ever leaves it — and how to turn each item off.'
---

# Private by design

Git Manager is a local application, not a client for a service. There is no account, no
telemetry, no analytics, no crash reporting — nothing about you, your repositories or your usage
is collected or sent anywhere. Your repositories are read with an embedded Git implementation,
on disk, and everything you see is computed on your machine.

## The complete list of what can leave your machine

Three things — each visible, each under your control:

| Traffic          | Where it goes                                                                                                           | When                                 | Turn it off                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| **AI requests**  | The provider **you** configured — `http://localhost:11434` (Ollama) by default, so by default not even off your machine | Only when you use an AI feature      | Settings → AI → disable, or never configure a remote endpoint |
| **GitHub**       | `github.com` (OAuth device flow, pull requests, issues, avatars)                                                        | Only if you connect a GitHub account | Don't connect one — every Git feature works without it        |
| **Update check** | This project's GitHub Releases (`latest.json`)                                                                          | On launch, to offer updates          | —                                                             |

Ordinary Git network operations — fetch, pull, push, clone — of course talk to **your** remotes,
exactly like the `git` command line would, using your own SSH keys or tokens.

## Where your data lives

- **Repositories** stay exactly where they are — the app never copies or uploads them.
- **Settings, tabs, pins, achievements** live in local application storage on your machine.
- **Daily briefings** (the AI morning summaries) are Markdown files under `~/.git-manager/summaries/` —
  yours to read, back up or delete.
- **Activity logs** (every Git operation the app ran, with its result) are local files, one click
  away from the footer.

## Credentials never reach the interface

SSH keys and HTTPS tokens are handled exclusively by the native (Rust) side of the app. They are
never passed into the interface layer, never logged, and never included in anything an AI
feature sends to your provider.
