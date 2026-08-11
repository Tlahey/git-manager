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
- **Settings, tabs, pins, achievements** live in `~/.git-manager/settings.json`, a plain JSON file
  you can read, back up or edit. It holds no password of any kind — see below.
- **Daily briefings** (the AI morning summaries) are Markdown files under `~/.git-manager/summaries/` —
  yours to read, back up or delete.
- **Activity logs** (every Git operation the app ran, with its result) are local files, one click
  away from the footer.

## Where your passwords live

Every secret the app holds — your GitHub token, and your AI provider's API key if you set one — is
stored in the **macOS Keychain**, never in a file of ours.

You can see them yourself. Open **Keychain Access** (the utility, not the Passwords app: these are
application passwords, which the Passwords app does not list), pick the **login** keychain, and
search for `git-manager`. Each secret appears as its own entry, named for what it is:

| Entry               | What it holds              |
| ------------------- | -------------------------- |
| `github:your-login` | Your GitHub token          |
| `ai:provider`       | Your AI provider's API key |

Deleting an entry there revokes the app's access on the spot, and removing an account in
Settings → Integrations deletes it for you.

`settings.json` keeps only the public half of a connected account: your login, your avatar and
which account is active. So you can copy that file between machines, keep it in a backup, or paste
it into a bug report without handing anyone your credentials. If you used a version of Git Manager
from before this change, your tokens are moved into the Keychain automatically the first time you
launch the new one — nothing to reconnect.

## Credentials never reach the interface

SSH keys and access tokens are handled exclusively by the native (Rust) side of the app. They are
never passed into the interface layer, never logged, and never included in anything an AI feature
sends to your provider.

This is enforced rather than promised: the interface has no way to _read_ a stored secret, because
no such instruction exists for it to use. When the app talks to GitHub, the interface names which
account to act as and the native side attaches the token — which is also why the app can only ever
send that token to GitHub's own API, and nowhere else.
