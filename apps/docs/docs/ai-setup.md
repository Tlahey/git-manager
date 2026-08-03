---
title: 'Set up your AI provider'
description: 'Point the app at Ollama in two commands, or at any OpenAI-compatible endpoint — every AI feature unlocks at once.'
---

# Set up your AI provider

Every AI feature — commit messages, explanations, reviews, the daily briefing, commit search —
talks to **one** provider you configure once. The app ships no cloud AI and no key of its own:
your prompts (which include diffs and commit messages from the repository you point it at) go to
the endpoint you chose, and nowhere else. See [Private by design](./privacy).

## Option 1 — Ollama (local, the default)

The app is preconfigured for [Ollama](https://ollama.com) at `http://localhost:11434`:

```bash
brew install ollama
ollama pull qwen2.5-coder
```

Then open **Settings → AI** (`⌘,`), pick the model you pulled in the model dropdown, and press
**Test connection**. The footer pill turns green ("Connected") when the provider answers —
that's it, every AI feature is live, fully offline.

Any model works; coder-tuned models give noticeably better commit messages and reviews. If your
machine can hold two, the optional **fast model** field lets the app use a smaller one for the
high-volume map phases (per-file summaries) and the main one for final compositions.

## Option 2 — any OpenAI-compatible endpoint

Choose the **OpenAI-compatible** preset in Settings → AI and fill in the base URL, the model
name, and an API key if the endpoint wants one. This covers LM Studio, llama.cpp's server, vLLM,
a team gateway, or a commercial API — anything speaking `/v1/chat/completions`.

::: warning Remote endpoints see your diffs
With a non-local URL, AI requests leave your machine. The rest of the app stays fully local
either way — only the AI features use this endpoint.
:::

## If something doesn't work

- **"AI provider is unreachable" banner** — the provider isn't answering `GET /v1/models`:
  check it is running (`ollama list`), and that the URL in Settings matches its port.
- **Generations cut off or oddly short** — the model's context window is too small for the
  diff; the app trims what it sends, but a bigger-context model helps for large changes.
- **Everything is slow** — local generation speed is your hardware's; the fast-model field and
  smaller models are the lever.
