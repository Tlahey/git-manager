# Spec 10 — Settings (Configuration)

## Goal

Allow the user to configure all aspects of the application: LLM, Git authentication, interface, language, theme, and behaviors.

---

## Settings structure

```
Settings
├── 🤖 LLM (Ollama)
├── 🔑 Git Authentication
├── 🌿 Git
├── 🎨 Appearance
├── 🌐 Language
├── 🎓 Learning
└── ⚙️ Advanced
```

---

## Section: LLM (Ollama)

```
┌─────────────────────────────────────────────────────────────┐
│  LLM — Commit generation                                    │
│                                                             │
│  Ollama URL:      [http://localhost:11434      ]  [Test]    │
│  Status:          ● Connected (3 models available)          │
│                                                             │
│  Model:           [llama3.2                    ▾]           │
│  Available models: llama3.2, qwen2.5-coder:7b, ...          │
│                                                             │
│  Temperature:     [0.3    ] (0 = deterministic, 1 = creative)│
│  Timeout:         [30     ] seconds                        │
│                                                             │
│  System prompt:   [Edit...]                             │
│                   (customize the style of the messages)     │
│                                                             │
│  ☑ Include repo context (name, branch)              │
│  ☑ Automatically detect scope from files   │
└─────────────────────────────────────────────────────────────┘
```

| Parameter | Type | Default |
|-----------|------|--------|
| `ollamaUrl` | string | `http://localhost:11434` |
| `ollamaModel` | string | `llama3.2` |
| `ollamaTemperature` | float | `0.3` |
| `ollamaTimeout` | integer (s) | `30` |
| `ollamaSystemPrompt` | string | (default prompt) |
| `includeRepoContext` | boolean | `true` |
| `autoDetectScope` | boolean | `true` |

---

## Section: Git Authentication

```
┌─────────────────────────────────────────────────────────────┐
│  Git Authentication                                        │
│                                                              │
│  SSH                                                         │
│  SSH private key:  [~/.ssh/id_ed25519         ]  [Browse]│
│  Passphrase:      [••••••••                  ]             │
│  ☑ Use system SSH agent (recommended)                │
│                                                              │
│  HTTPS                                                       │
│  [+ Add a token]                                        │
│                                                              │
│  github.com      ghp_•••••••••••••••••  [Edit] [✕]     │
│  gitlab.com      glpat-•••••••••••••••  [Edit] [✕]     │
│                                                              │
│  ☑ Use macOS Keychain                   │
└─────────────────────────────────────────────────────────────┘
```

**Security**: Tokens and SSH keys never transit through JavaScript. Stored exclusively in the Rust process, and in the macOS Keychain if enabled.

---

## Section: Git

```
┌─────────────────────────────────────────────────────────────┐
│  Git Settings                                             │
│                                                             │
│  Default identity                                        │
│  Name:    [Antoine Dupont                    ]              │
│  Email:  [antoine@example.com               ]              │
│  (used if no local git config)                      │
│                                                             │
│  Protected branches (no reset --hard)                   │
│  [main] [master] [develop] [+ Add]                     │
│                                                             │
│  Automatic fetch:                                        │
│  ○ Disabled                                               │
│  ● Every 5 min                                         │
│  ○ Every 15 min                                        │
│                                                             │
│  Merge editor:   [Built-in ▾]                          │
│                        (Built-in / VS Code / other)          │
│                                                             │
│  ☑ Show remote branches in the git tree           │
│  ☑ Confirm before push --force                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Section: Appearance

```
┌─────────────────────────────────────────────────────────────┐
│  Appearance                                                  │
│                                                             │
│  Theme:    ○ Light   ● Dark   ○ System                 │
│                                                             │
│  Font size:    [14px  ▾]                           │
│                                                             │
│  History density:                                  │
│  ○ Compact   ● Normal   ○ Comfortable                      │
│                                                             │
│  Graph colors:   [Palette ▾]  [Preview]    │
│                                                             │
│  ☑ Show avatars (Gravatar, local)                  │
│  ☑ Interface animations                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Section: Language

```
┌─────────────────────────────────────────────────────────────┐
│  Language                                                     │
│                                                             │
│  ● French                                                 │
│  ○ English                                                  │
│                                                             │
│  Restart required: No (change takes effect immediately)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Section: Learning

> See [Spec 11 — Pedagogy](./11-pedagogy.md) for the full detail of each feature.

```
┌─────────────────────────────────────────────────────────────┐
│  Learning                                              │
│                                                             │
│  Learning mode:                                       │
│  ○ Disabled                                               │
│  ○ Intermediate  (command + risk before each action)  │
│  ● Beginner       (full explanation)                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ☑ Git Console  (show commands in real time)     │
│  ☑ Pedagogic tooltips on actions                   │
│  ☑ Post-action summary (enriched toast)                   │
│  ☑ Action journal                                 │
│  ☐ Hide preview before destructive actions       │
│    (option for advanced users)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| Parameter | Type | Default |
|-----------|------|--------|
| `learningMode` | `'off' \| 'beginner' \| 'intermediate'` | `'off'` |
| `showGitConsole` | boolean | `false` |
| `showPedagogicTooltips` | boolean | `true` |
| `showPostActionSummary` | boolean | `true` |
| `showActionJournal` | boolean | `true` |
| `skipCommandPreview` | boolean | `false` |

---

```
┌─────────────────────────────────────────────────────────────┐
│  Advanced                                                     │
│                                                             │
│  Folders excluded from scan:                                  │
│  [node_modules] [.pnpm-store] [dist] [+ Add]           │
│                                                             │
│  Max scan depth:    [3     ]                       │
│                                                             │
│  App data folder:    ~/.config/git-manager  [Open]│
│                                                             │
│  [Export settings]     [Import settings]   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Danger zone                                            │
│  [Reset all settings]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Persistence

Settings are stored in `~/.config/git-manager/config.json` via `tauri-plugin-store`.

Credentials (tokens, SSH passphrase) are stored in the macOS Keychain via `tauri-plugin-keychain` (or the `keyring` crate on the Rust side).

---

## Tauri commands involved

| Command | Description |
|---------|-------------|
| `get_settings` | Returns the complete config |
| `update_settings(partial)` | Partially updates |
| `test_ollama_connection(url)` | Tests the connection + lists models |
| `save_credential(host, token)` | Stores in Keychain |
| `delete_credential(host)` | Deletes from Keychain |
| `list_credentials` | Returns the configured hosts (without the tokens) |

---

## React components

```
app/settings/
├── SettingsPage.tsx           # Layout with nav sections
├── LlmSettings.tsx            # Ollama section
├── AuthSettings.tsx           # Credentials section
├── GitSettings.tsx            # Git config section
├── AppearanceSettings.tsx     # Theme / UI section
├── LanguageSettings.tsx       # Language section
├── LearningSettings.tsx       # Learning section (Spec 11)
└── AdvancedSettings.tsx       # Advanced section + danger zone
```

---

## i18n keys

```json
{
  "settings.title": "Paramètres",
  "settings.sections.llm": "LLM",
  "settings.sections.auth": "Authentification",
  "settings.sections.git": "Git",
  "settings.sections.appearance": "Apparence",
  "settings.sections.language": "Langue",
  "settings.sections.advanced": "Avancé",
  "settings.ollama.url": "URL Ollama",
  "settings.ollama.test": "Tester la connexion",
  "settings.ollama.connected": "Connecté ({{count}} modèles)",
  "settings.ollama.disconnected": "Non connecté",
  "settings.auth.addToken": "Ajouter un token",
  "settings.git.protectedBranches": "Branches protégées",
  "settings.appearance.theme.light": "Clair",
  "settings.appearance.theme.dark": "Sombre",
  "settings.appearance.theme.system": "Système",
  "settings.advanced.scanDepth": "Profondeur de scan",
  "settings.advanced.reset": "Réinitialiser tous les paramètres",
  "settings.advanced.resetConfirm": "Tous vos paramètres seront perdus. Continuer ?",
  "settings.sections.learning": "Apprentissage",
  "settings.learning.mode": "Mode apprentissage",
  "settings.learning.mode.off": "Désactivé",
  "settings.learning.mode.beginner": "Débutant",
  "settings.learning.mode.intermediate": "Intermédiaire",
  "settings.learning.console": "Console Git",
  "settings.learning.tooltips": "Tooltips pédagogiques sur les actions",
  "settings.learning.postAction": "Résumé post-action",
  "settings.learning.journal": "Journal des actions",
  "settings.learning.skipPreview": "Masquer la preview avant les actions destructives"
}
```
