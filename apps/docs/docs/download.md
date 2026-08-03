---
title: Download & Install
description: Get Git Manager for macOS — the release download, the first-launch Gatekeeper step, and the from-source alternative.
editLink: false
---

# Download & Install

Git Manager is a free, open-source **macOS** app. There's no App Store listing —
releases are published straight from this repository.

## Download the app

Get the latest build from **[GitHub Releases](https://github.com/Tlahey/git-manager/releases/latest)**.
Each release publishes two macOS files:

- **`git-manager_<version>_aarch64.dmg`** — the installer. Open it, then drag
  Git Manager into your Applications folder.
- **`git-manager_<version>_aarch64.app.zip`** — the built app itself, if you'd
  rather unzip and move it yourself.

## First launch: macOS will warn you

Git Manager isn't signed with an Apple Developer certificate yet, so the first
time you open it, Gatekeeper shows _"Apple could not verify this app is free of
malware."_ That's expected — it isn't a sign anything is wrong.

To open it anyway:

1. **Control-click** (or right-click) `Git Manager.app` in Applications and
   choose **Open**.
2. Confirm **Open** in the dialog that follows.

You only need to do this once. Every launch after the first works normally.

## Staying up to date

Once installed, Git Manager checks GitHub Releases for a newer version on
launch and offers to update from **Settings → General** — no need to come back
here for every release.

## Building from source instead

Git Manager is MIT-licensed and the whole toolchain is open. If you'd rather
build it yourself, the
[README's Getting started section](https://github.com/Tlahey/git-manager#getting-started)
has the full setup (Xcode Command Line Tools, Rust, Node, and `pnpm dev`).

::: tip Ready to start?
Once it's open, jump to [the commit graph](/docs/features/commit-graph) — it's
where every repository opens, and the entry point to everything else.
:::
