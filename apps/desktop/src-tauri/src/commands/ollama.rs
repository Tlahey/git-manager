use crate::error::AppError;
use crate::models::OllamaStatus;
use crate::state::AppState;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaOptions {
    temperature: f32,
}

#[derive(Debug, Deserialize)]
struct OllamaGenerateChunk {
    response: String,
    done: bool,
}

/// Vérifie si Ollama est disponible et liste les modèles
#[tauri::command]
pub async fn check_ollama_status(url: String) -> Result<OllamaStatus, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(AppError::Http)?;

    let tags_url = format!("{}/api/tags", url.trim_end_matches('/'));

    match client.get(&tags_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let data: OllamaTagsResponse = resp.json().await.map_err(AppError::Http)?;
            let models = data.models.into_iter().map(|m| m.name).collect();
            Ok(OllamaStatus {
                connected: true,
                models,
                version: None,
            })
        }
        _ => Ok(OllamaStatus {
            connected: false,
            models: vec![],
            version: None,
        }),
    }
}

/// Lance la génération d'un message de commit depuis le diff, en streaming
#[tauri::command]
pub async fn generate_commit_message(
    path: String,
    model: String,
    prompt_hint: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Reset le flag d'annulation
    *state.generation_cancel.lock().unwrap() = false;

    // Obtenir le diff des fichiers staged
    let diff_content = get_staged_diff(&path)?;

    if diff_content.is_empty() {
        return Err(AppError::Unknown("No staged changes".to_string()).into());
    }

    let ollama_config = state.ollama_config.lock().unwrap().clone();

    let system_prompt = r#"You are a Git commit message generator. Your task is to write a concise, meaningful commit message following the Conventional Commits specification.

Rules:
- First line: <type>(<scope>): <description> (max 72 chars)
- Use imperative mood: "add", "fix", "update"
- Scope is optional but recommended
- Add a body only if the change needs explanation
- Output ONLY the commit message, nothing else

Types: feat, fix, chore, docs, style, refactor, test, perf, build, ci"#;

    let user_prompt = format!(
        "{}\n\nAnalyze the following Git diff and generate a commit message:\n\n--- DIFF ---\n{}\n--- END DIFF ---\n{}",
        system_prompt,
        truncate_diff(&diff_content, 4000),
        prompt_hint.map(|h| format!("\nHint: {}", h)).unwrap_or_default()
    );

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(
            ollama_config.timeout_seconds,
        ))
        .build()
        .map_err(AppError::Http)?;

    let request = OllamaGenerateRequest {
        model: model.clone(),
        prompt: user_prompt,
        stream: true,
        options: OllamaOptions {
            temperature: ollama_config.temperature,
        },
    };

    let generate_url = format!("{}/api/generate", ollama_config.url.trim_end_matches('/'));

    let resp = client
        .post(&generate_url)
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            AppError::Ollama(if e.is_connect() {
                "OLLAMA_NOT_RUNNING".to_string()
            } else {
                e.to_string()
            })
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        if status.as_u16() == 404 {
            return Err(AppError::Ollama("OLLAMA_MODEL_NOT_FOUND".to_string()).into());
        }
        return Err(AppError::Ollama(format!("HTTP {}", status)).into());
    }

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        // Vérifier l'annulation
        if *state.generation_cancel.lock().unwrap() {
            let _ = app.emit("ollama:cancelled", ());
            return Ok(());
        }

        let bytes = chunk.map_err(AppError::Http)?;
        if let Ok(text) = std::str::from_utf8(&bytes) {
            for line in text.lines() {
                if line.is_empty() {
                    continue;
                }
                if let Ok(chunk_data) = serde_json::from_str::<OllamaGenerateChunk>(line) {
                    let _ = app.emit("ollama:token", &chunk_data.response);
                    if chunk_data.done {
                        let _ = app.emit("ollama:done", ());
                        return Ok(());
                    }
                }
            }
        }
    }

    let _ = app.emit("ollama:done", ());
    Ok(())
}

/// Annule la génération en cours
#[tauri::command]
pub async fn cancel_generation(state: State<'_, AppState>) -> Result<(), String> {
    *state.generation_cancel.lock().unwrap() = true;
    Ok(())
}

fn get_staged_diff(repo_path: &str) -> Result<String, String> {
    use git2::Repository;

    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut index = repo.index().map_err(AppError::Git)?;
    let index_tree = index
        .write_tree()
        .and_then(|oid| repo.find_tree(oid))
        .map_err(AppError::Git)?;

    let diff = repo
        .diff_tree_to_tree(head.as_ref(), Some(&index_tree), None)
        .map_err(AppError::Git)?;

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            _ => " ",
        };
        diff_text.push_str(prefix);
        if let Ok(content) = std::str::from_utf8(line.content()) {
            diff_text.push_str(content);
        }
        true
    })
    .map_err(AppError::Git)?;

    Ok(diff_text)
}

fn truncate_diff(diff: &str, max_chars: usize) -> String {
    if diff.len() <= max_chars {
        diff.to_string()
    } else {
        format!(
            "{}\n\n[diff truncated, showing first {} chars]",
            &diff[..max_chars],
            max_chars
        )
    }
}
