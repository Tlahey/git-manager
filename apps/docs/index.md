---
# `false`, not `home`: this page is the marketing landing page, which brings its
# own nav, hero and footer — VitePress's chrome would be a second set of all
# three. The component is registered globally in .vitepress/theme/index.ts.
layout: false
title: Git Manager — The Git client that stays out of your way
# The docs append "| Git Manager" to every title; on the home page that would
# read "…stays out of your way | Git Manager".
titleTemplate: false
description: Git Manager is a beautiful, free macOS desktop Git client. Visual graph, AI-powered commit messages, rollback, and more — 100% local, zero telemetry, open source.
head:
  - - meta
    - property: og:title
      content: Git Manager
  - - meta
    - property: og:description
      content: Free macOS Git client. No telemetry. No cloud. Just Git.
  - - meta
    - property: og:type
      content: website
  - - meta
    - property: og:url
      content: https://tlahey.github.io/git-manager/
  - - meta
    - property: og:image
      content: https://tlahey.github.io/git-manager/og-image.png
  - - meta
    - name: twitter:card
      content: summary_large_image
---

<LandingPage />
