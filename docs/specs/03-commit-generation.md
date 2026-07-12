# Spec 03 — AI Commit Generation (Ollama)

## Objective

Automatically generate a commit message in Conventional Commits format from the selected diff, using a local LLM via Ollama. Generation is fast, private, and the message remains fully editable.

---

## User flow

```
1. The user has staged files (or selects hunks)
2. Click "✨ Generate message"
3. The app sends the diff to Ollama (streaming)
4. The message appears token by token in the text area
5. The user can edit it, validate it, or regenerate
6. Click "Commit" → commit created
```

---

## Expected output format

The generated message follows the **Conventional Commits** format:

```
<type>(<scope>): <short description>

[optional body: context, reasons for the change]

[optional footer: BREAKING CHANGE, closes #123]
```

**Supported types**: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `perf`, `build`, `ci`

---

## Ollama integration

### Configuration

| Parameter   | Default                  | Configurable in           |
| ----------- | ------------------------ | ------------------------- |
| Ollama URL  | `http://localhost:11434` | Settings → LLM            |
| Model       | `llama3.2`               | Settings → LLM            |
| Temperature | `0.3`                    | Settings → LLM (advanced) |
| Timeout     | `30s`                    | Settings → LLM (advanced) |

### API call

```
POST http://localhost:11434/api/generate
{
  "model": "llama3.2",
  "prompt": "<built prompt>",
  "stream": true,
  "options": { "temperature": 0.3 }
}
```

The response is streamed line by line (NDJSON). Each line contains a token:

```json
{ "model": "llama3.2", "response": " feat", "done": false }
```

---

## Prompt Engineering

### System prompt (injected into every request)

```
You are a Git commit message generator. Your task is to write a concise,
meaningful commit message following the Conventional Commits specification.

Rules:
- First line: <type>(<scope>): <description> (max 72 chars)
- Use imperative mood: "add", "fix", "update", not "added", "fixed"
- Scope is optional but recommended (e.g., auth, api, ui)
- Add a body only if the change needs explanation
- Do NOT include the diff in the output
- Output ONLY the commit message, nothing else

Types: feat, fix, chore, docs, style, refactor, test, perf, build, ci
```

### User prompt (built dynamically)

```
Analyze the following Git diff and generate a commit message:

--- DIFF ---
{diff_content}
--- END DIFF ---

{user_hint_if_provided}
```

### Diff truncation

Large diffs are intelligently truncated:

1. Priority given to new files and modified files
2. Max 4000 tokens of diff (configurable)
3. If truncated: mention `[diff truncated, showing first N changes]`

---

## React components

```
components/commit-panel/
├── CommitPanel.tsx           # Main panel (working tree + commit)
├── StagedFiles.tsx           # List of staged files
├── CommitMessageEditor.tsx   # Text area + generate button
├── GenerateButton.tsx        # Button with state (idle/loading/streaming)
└── ConventionalCommitHint.tsx # Type/scope help for manual entry
```

---

## Generation states

| State                 | UI                                                |
| --------------------- | ------------------------------------------------- |
| `idle`                | "✨ Generate" button active                       |
| `connecting`          | Spinner, "Connecting to Ollama..."                |
| `streaming`           | Text appears progressively, "⏹ Stop" button       |
| `done`                | Complete message, "Regenerate" + "Commit" buttons |
| `error:ollama_down`   | Banner "Ollama is not running — `ollama serve`"   |
| `error:model_missing` | Banner "Model not found — `ollama pull {model}`"  |
| `error:no_staged`     | Disabled button, tooltip "Stage files first"      |

---

## Tauri commands involved

| Command                                              | Description                                             |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `generate_commit_message(path, model, prompt_hint?)` | Starts generation, emits `ollama:token` events          |
| `cancel_generation()`                                | Cancels the ongoing generation                          |
| `check_ollama_status()` → `OllamaStatus`             | Checks whether Ollama is available and lists the models |

### Streaming events on the Rust side

```rust
// Emitted for each token received from Ollama
app_handle.emit("ollama:token", token_string).unwrap();

// Emitted when generation is complete
app_handle.emit("ollama:done", full_message).unwrap();

// Emitted on error
app_handle.emit("ollama:error", error_message).unwrap();
```

---

## Error handling

- **Ollama not running**: detected before the call, clear message with the command to run
- **Missing model**: message with the `ollama pull` command
- **Timeout**: clean cancellation after the configured delay
- **Empty response**: prompt to rephrase or change model

---

## Session history

During the session, the last N generated messages are remembered (not persisted between sessions):

- Accessible via a dropdown menu on the "Generate" button
- Allows going back to a previous message

---

## i18n keys

```json
{
  "commit.generate": "Générer le message",
  "commit.regenerate": "Régénérer",
  "commit.stop": "Arrêter",
  "commit.placeholder": "Message de commit...",
  "commit.hintType": "Type (feat, fix, ...)",
  "commit.hintScope": "Scope (optionnel)",
  "commit.ollamaDown": "Ollama n'est pas démarré. Lancez : ollama serve",
  "commit.modelMissing": "Modèle introuvable. Lancez : ollama pull {{model}}",
  "commit.noStaged": "Stagez des fichiers avant de générer",
  "commit.history": "Messages récents"
}
```
