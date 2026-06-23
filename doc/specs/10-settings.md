# Spec 10 — Settings (Configuration)

## Objectif

Permettre à l'utilisateur de configurer tous les aspects de l'application : LLM, authentification Git, interface, langue, thème et comportements.

---

## Structure des Settings

```
Settings
├── 🤖 LLM (Ollama)
├── 🔑 Authentification Git
├── 🌿 Git
├── 🎨 Apparence
├── 🌐 Langue
├── 🎓 Apprentissage
└── ⚙️ Avancé
```

---

## Section : LLM (Ollama)

```
┌─────────────────────────────────────────────────────────────┐
│  LLM — Génération de commits                                │
│                                                             │
│  URL Ollama :     [http://localhost:11434      ]  [Tester]  │
│  Statut :         ● Connecté (3 modèles disponibles)        │
│                                                             │
│  Modèle :         [llama3.2                    ▾]           │
│  Modèles dispo :  llama3.2, qwen2.5-coder:7b, ...          │
│                                                             │
│  Température :    [0.3    ] (0 = déterministe, 1 = créatif) │
│  Timeout :        [30     ] secondes                        │
│                                                             │
│  Prompt système : [Modifier...]                             │
│                   (personnaliser le style des messages)     │
│                                                             │
│  ☑ Inclure le contexte du repo (nom, branche)              │
│  ☑ Détecter automatiquement le scope depuis les fichiers   │
└─────────────────────────────────────────────────────────────┘
```

| Paramètre | Type | Défaut |
|-----------|------|--------|
| `ollamaUrl` | string | `http://localhost:11434` |
| `ollamaModel` | string | `llama3.2` |
| `ollamaTemperature` | float | `0.3` |
| `ollamaTimeout` | integer (s) | `30` |
| `ollamaSystemPrompt` | string | (prompt par défaut) |
| `includeRepoContext` | boolean | `true` |
| `autoDetectScope` | boolean | `true` |

---

## Section : Authentification Git

```
┌─────────────────────────────────────────────────────────────┐
│  Authentification Git                                        │
│                                                              │
│  SSH                                                         │
│  Clé privée SSH :  [~/.ssh/id_ed25519         ]  [Parcourir]│
│  Passphrase :      [••••••••                  ]             │
│  ☑ Utiliser l'agent SSH système (recommandé)                │
│                                                              │
│  HTTPS                                                       │
│  [+ Ajouter un token]                                        │
│                                                              │
│  github.com      ghp_•••••••••••••••••  [Modifier] [✕]     │
│  gitlab.com      glpat-•••••••••••••••  [Modifier] [✕]     │
│                                                              │
│  ☑ Utiliser le trousseau macOS (Keychain)                   │
└─────────────────────────────────────────────────────────────┘
```

**Sécurité** : Les tokens et clés SSH ne transitent jamais côté JavaScript. Stockés exclusivement dans le process Rust, et dans le Keychain macOS si activé.

---

## Section : Git

```
┌─────────────────────────────────────────────────────────────┐
│  Paramètres Git                                             │
│                                                             │
│  Identité par défaut                                        │
│  Nom :    [Antoine Dupont                    ]              │
│  Email :  [antoine@example.com               ]              │
│  (utilisé si pas de config git locale)                      │
│                                                             │
│  Branches protégées (pas de reset --hard)                   │
│  [main] [master] [develop] [+ Ajouter]                     │
│                                                             │
│  Fetch automatique :                                        │
│  ○ Désactivé                                               │
│  ● Toutes les 5 min                                         │
│  ○ Toutes les 15 min                                        │
│                                                             │
│  Editeur de merge :   [Intégré ▾]                          │
│                        (Intégré / VS Code / autre)          │
│                                                             │
│  ☑ Afficher les branches remote dans le git tree           │
│  ☑ Confirmer avant push --force                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Section : Apparence

```
┌─────────────────────────────────────────────────────────────┐
│  Apparence                                                  │
│                                                             │
│  Thème :    ○ Clair   ● Sombre   ○ Système                 │
│                                                             │
│  Taille de police :    [14px  ▾]                           │
│                                                             │
│  Densité de l'historique :                                  │
│  ○ Compact   ● Normal   ○ Confortable                      │
│                                                             │
│  Couleurs du graphe :   [Palette ▾]  [Prévisualisation]    │
│                                                             │
│  ☑ Afficher les avatars (Gravatar, local)                  │
│  ☑ Animations de l'interface                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Section : Langue

```
┌─────────────────────────────────────────────────────────────┐
│  Langue                                                     │
│                                                             │
│  ● Français                                                 │
│  ○ English                                                  │
│                                                             │
│  Redémarrage requis : Non (changement immédiat)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Section : Apprentissage

> Voir [Spec 11 — Pédagogie](./11-pedagogie.md) pour le détail complet de chaque feature.

```
┌─────────────────────────────────────────────────────────────┐
│  Apprentissage                                              │
│                                                             │
│  Mode apprentissage :                                       │
│  ○ Désactivé                                               │
│  ○ Intermédiaire  (commande + risque avant chaque action)  │
│  ● Débutant       (explication complète)                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ☑ Console Git  (afficher les commandes en temps réel)     │
│  ☑ Tooltips pédagogiques sur les actions                   │
│  ☑ Résumé post-action (toast enrichi)                      │
│  ☑ Journal des actions                                     │
│  ☐ Masquer la preview avant les actions destructives       │
│    (option pour les utilisateurs avancés)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| Paramètre | Type | Défaut |
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
│  Avancé                                                     │
│                                                             │
│  Dossiers exclus du scan :                                  │
│  [node_modules] [.pnpm-store] [dist] [+ Ajouter]           │
│                                                             │
│  Profondeur de scan max :    [3     ]                       │
│                                                             │
│  Dossier de données app :    ~/.config/git-manager  [Ouvrir]│
│                                                             │
│  [Exporter les paramètres]     [Importer les paramètres]   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Zone dangereuse                                            │
│  [Réinitialiser tous les paramètres]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Persistance

Les settings sont stockés dans `~/.config/git-manager/config.json` via `tauri-plugin-store`.

Les credentials (tokens, passphrase SSH) sont stockés dans le Keychain macOS via `tauri-plugin-keychain` (ou la crate `keyring` côté Rust).

---

## Commandes Tauri impliquées

| Command | Description |
|---------|-------------|
| `get_settings` | Retourne la config complète |
| `update_settings(partial)` | Met à jour partiellement |
| `test_ollama_connection(url)` | Teste la connexion + liste les modèles |
| `save_credential(host, token)` | Stocke dans Keychain |
| `delete_credential(host)` | Supprime du Keychain |
| `list_credentials` | Retourne les hosts configurés (sans les tokens) |

---

## Composants React

```
app/settings/
├── SettingsPage.tsx           # Layout avec nav sections
├── LlmSettings.tsx            # Section Ollama
├── AuthSettings.tsx           # Section credentials
├── GitSettings.tsx            # Section git config
├── AppearanceSettings.tsx     # Section thème / UI
├── LanguageSettings.tsx       # Section langue
├── LearningSettings.tsx       # Section apprentissage (Spec 11)
└── AdvancedSettings.tsx       # Section avancé + danger zone
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
