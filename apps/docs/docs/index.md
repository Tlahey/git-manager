---
title: Introduction
description: What Git Manager is, what this documentation covers, and how these pages are kept honest.
# The site-wide edit link points at the .feature files the generated pages come
# from. This page is hand-written and comes from none of them.
editLink: false
---

# Introduction

Git Manager is a free, open-source Git client for macOS. It runs entirely on your
machine: no account, no cloud backend, no telemetry. The only things it ever talks
to are the AI provider you configure yourself — a local Ollama by default — and
GitHub, when you ask it to.

This site documents what each part of the app does and how to drive it.

## What this is, and is not

It is a **reference for the app**: one page per area of the interface, each
explaining what you are looking at, what you can do from it, and what happens
when you do.

It is **not a Git tutorial**. The pages assume you know roughly what a commit, a
branch and a merge are, and explain what Git Manager does with them. Where the
app's behaviour differs from raw `git` — the merge editor, the undo history, the
staging model — the page says so, because that is exactly where knowing Git is
not enough.

## How to read it

The sidebar follows what you are trying to do rather than the app's menus:

- **Reading your repository** — the commit graph, the view every repository opens
  on, and how to inspect a single commit from it.
- **Making changes** — the staging panel: choosing what goes into the next
  commit, and reviewing it before you do.
- **When Git gets in the way** — resolving a conflict in the three-way editor.

Every page has the same shape: an explanation of the feature, a screenshot of it,
the steps to perform it, and what you should see afterwards.

::: tip Don't have it yet?
[Download & install Git Manager](/docs/download) first, then come back — every
page below assumes the app is already open.
:::

::: tip Already installed?
Start with [the commit graph](/docs/features/commit-graph). It is where every
repository opens, and the entry point to everything else.
:::

## Why the screenshots can be trusted

Documentation screenshots normally rot: someone changes the UI, and the picture in
the docs quietly keeps showing last year's app. These cannot, because nobody takes
them by hand.

Every picture here is exported by an end-to-end test driving the real macOS app
against a scripted repository. The steps listed under each screenshot are that
test's own steps. If a feature stops working the way a page describes it, the test
that produced the page fails.

The prose is the opposite — it needs intent a test cannot state, so it is written
by a human, reviewed, and committed next to the scenario it describes. A model may
draft it; what ships is what someone edited and approved. No model runs when the
site is built.

If a page ever contradicts the app, the page is the bug — use the **Report a
documentation issue** link at the bottom of any page to say where.

## What is not covered yet

**Where the notification card lands on a second display.** The card that slides
down from the top of the screen is positioned against the camera housing of a
MacBook's built-in display, from measurements the app asks macOS for. Those
measurements have only ever been checked on one machine. On a Mac without a
notch, or on an external monitor, the app falls back to default measurements —
and that fallback has not been verified on real hardware, so the card may sit a
few points off where it should.

This is cosmetic. Nothing about *what* a notification says or does depends on it,
and a card that cannot be measured is still shown. If you see one land somewhere
obviously wrong, the **Report a documentation issue** link takes you to the right
place to say so — including which Mac and which display.
