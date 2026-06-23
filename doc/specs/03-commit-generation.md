# Spec 03 — Génération de commits IA (Ollama)

## Objectif

Générer automatiquement un message de commit au format Conventional Commits depuis le diff sélectionné, en utilisant un LLM local via Ollama. La génération est rapide, privée, et le message reste entièrement éditable.

---

## Flux utilisateur

```
1. L'utilisateur a des fichiers staged (ou sélectionne des hunks)
2. Clic sur "✨ Générer le message"
3. L'app envoie le diff à Ollama (streaming)
4. Le message apparaît token par token dans la zone de texte
5. L'utilisateur peut l'éditer, valider ou régénérer
6. Clic "Commit" → commit créé
```

---

## Format de sortie attendu

Le message généré suit le format **Conventional Commits** :

```
<type>(<scope>): <description courte>

[corps optionnel : contexte, raisons du changement]

[footer optionnel : BREAKING CHANGE, closes #123]
```

**Types supportés** : `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `perf`, `build`, `ci`

---

## Intégration Ollama

### Configuration

| Paramètre | Défaut | Configurable dans |
|-----------|--------|-------------------|
| URL Ollama | `http://localhost:11434` | Settings → LLM |
| Modèle | `llama3.2` | Settings → LLM |
| Température | `0.3` | Settings → LLM (avancé) |
| Timeout | `30s` | Settings → LLM (avancé) |

### Appel API

```
POST http://localhost:11434/api/generate
{
  "model": "llama3.2",
  "prompt": "<prompt construit>",
  "stream": true,
  "options": { "temperature": 0.3 }
}
```

La réponse est streamée ligne par ligne (NDJSON). Chaque ligne contient un token :
```json
{"model":"llama3.2","response":" feat","done":false}
```

---

## Prompt Engineering

### Prompt système (injecté dans chaque requête)

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

### Prompt utilisateur (construit dynamiquement)

```
Analyze the following Git diff and generate a commit message:

--- DIFF ---
{diff_content}
--- END DIFF ---

{user_hint_if_provided}
```

### Troncature du diff

Les diffs volumineux sont tronqués intelligemment :
1. Priorité aux nouveaux fichiers et fichiers modifiés
2. Max 4000 tokens de diff (configurable)
3. Si tronqué : mention `[diff truncated, showing first N changes]`

---

## Composants React

```
components/commit-panel/
├── CommitPanel.tsx           # Panneau principal (working tree + commit)
├── StagedFiles.tsx           # Liste des fichiers staged
├── CommitMessageEditor.tsx   # Zone de texte + bouton générer
├── GenerateButton.tsx        # Bouton avec état (idle/loading/streaming)
└── ConventionalCommitHint.tsx # Aide type/scope si saisie manuelle
```

---

## États de la génération

| État | UI |
|------|-----|
| `idle` | Bouton "✨ Générer" actif |
| `connecting` | Spinner, "Connexion à Ollama..." |
| `streaming` | Texte apparaît progressivement, bouton "⏹ Arrêter" |
| `done` | Message complet, boutons "Régénérer" + "Commit" |
| `error:ollama_down` | Bannière "Ollama n'est pas démarré — `ollama serve`" |
| `error:model_missing` | Bannière "Modèle non trouvé — `ollama pull {model}`" |
| `error:no_staged` | Bouton désactivé, tooltip "Stagez des fichiers d'abord" |

---

## Commandes Tauri impliquées

| Command | Description |
|---------|-------------|
| `generate_commit_message(path, model, prompt_hint?)` | Lance la génération, émet les events `ollama:token` |
| `cancel_generation()` | Annule la génération en cours |
| `check_ollama_status()` → `OllamaStatus` | Vérifie si Ollama est disponible et liste les modèles |

### Event streaming côté Rust

```rust
// Émis pour chaque token reçu d'Ollama
app_handle.emit("ollama:token", token_string).unwrap();

// Émis quand la génération est terminée
app_handle.emit("ollama:done", full_message).unwrap();

// Émis en cas d'erreur
app_handle.emit("ollama:error", error_message).unwrap();
```

---

## Gestion des erreurs

- **Ollama non démarré** : détecté avant l'appel, message clair avec commande à exécuter
- **Modèle manquant** : message avec la commande `ollama pull`
- **Timeout** : annulation propre après le délai configuré
- **Réponse vide** : invitation à reformuler ou changer de modèle

---

## Historique de session

Pendant la session, les N derniers messages générés sont mémorisés (non persistés entre sessions) :
- Accessible via un menu déroulant sur le bouton "Générer"
- Permet de revenir à un message précédent

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
