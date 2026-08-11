//! The GitHub commands.
//!
//! Thin on purpose: the HTTP itself, the URL allowlist and the keychain lookup all live in
//! `services/github_api.rs`, and every command here either drives the OAuth device flow (which talks
//! to `github.com`, not the API) or hands a request to that service.
//!
//! **No command returns a token.** `github_poll_token` used to hand the access token to JavaScript,
//! which then persisted it; it now stores the token itself and answers with the profile it belongs
//! to. That is the whole shape of this change — see `services/credential_store.rs`.

use crate::error::AppError;
use crate::services::credential_store::{self, CredentialKind};
use crate::services::github_api::{self, GitHubUserInfo, GithubApiResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const GITHUB_CLIENT_ID: &str = "Ov23li6mKsqDplEY33m8";

// ─── Device Flow: Request Code ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// Requests a device authorization code from GitHub.
/// Returns the device_code, user_code, and verification_uri for the user.
#[tauri::command]
pub async fn github_device_code(scope: String) -> Result<DeviceCodeResponse, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(AppError::Http)?;

    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_id": GITHUB_CLIENT_ID,
            "scope": scope,
        }))
        .send()
        .await
        .map_err(AppError::Http)?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        eprintln!("[GitHub OAuth] Device code request failed: HTTP {status}");
        return Err(AppError::Unknown(format!(
            "GitHub device code request failed (HTTP {}): {}",
            status, body
        ))
        .into());
    }

    let data: DeviceCodeResponse = res.json().await.map_err(AppError::Http)?;
    Ok(data)
}

// ─── Device Flow: Poll for Token ─────────────────────────────────────────────

/// What GitHub itself answers a poll with.
#[derive(Debug, Deserialize)]
struct RawPollTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// What the frontend gets — the *account*, never the token behind it.
///
/// Where this used to carry `access_token` straight through to JavaScript (which then wrote it into
/// `settings.json`), an authorized poll now connects the account inside Rust and reports only the
/// public profile. There is deliberately no field a caller could read a credential out of.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PollTokenResponse {
    /// Present once the user has approved *and* the account has been stored in the keychain.
    pub user: Option<GitHubUserInfo>,
    /// Present while waiting or on error: "authorization_pending", "slow_down", "expired_token", "access_denied"
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Polls GitHub for the access token behind a `device_code` and, once it arrives, connects the
/// account: the token goes to the keychain and the caller is told who signed in.
#[tauri::command]
pub async fn github_poll_token(device_code: String) -> Result<PollTokenResponse, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(AppError::Http)?;

    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_id": GITHUB_CLIENT_ID,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        }))
        .send()
        .await
        .map_err(AppError::Http)?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        eprintln!("[GitHub OAuth] Token poll failed: HTTP {status}");
        return Err(AppError::Unknown(format!(
            "GitHub token poll failed (HTTP {}): {}",
            status, body
        ))
        .into());
    }

    let data: RawPollTokenResponse = res.json().await.map_err(AppError::Http)?;

    // The token is consumed here and never travels further: `connect_account` validates it, files it
    // in the keychain under the login it names, and gives back the profile.
    let user = match data.access_token.as_deref() {
        Some(token) if !token.is_empty() => Some(github_api::connect_account(token).await?),
        _ => None,
    };

    Ok(PollTokenResponse {
        user,
        error: data.error,
        error_description: data.error_description,
    })
}

// ─── Connecting an account ───────────────────────────────────────────────────

/// Validates a personal access token, stores it in the keychain, and returns the profile it belongs
/// to — the "Add with a token" path, and the counterpart of what `github_poll_token` does for OAuth.
///
/// Replaces the former `github_get_user(token)`, which handed the profile back and left the caller
/// holding the token. The token still arrives from the webview (the user pastes it there, so it has
/// to), but this is where that trip ends.
#[tauri::command]
pub async fn github_connect_token(token: String) -> Result<GitHubUserInfo, String> {
    Ok(github_api::connect_account(&token).await?)
}

/// Forgets an account's token. The account's public half is removed from the settings by the
/// frontend; this is the half it cannot reach.
#[tauri::command]
pub fn github_disconnect_account(account_id: String) -> Result<(), String> {
    credential_store::delete_secret(CredentialKind::GitHub, &account_id)?;
    Ok(())
}

// ─── The API proxy ───────────────────────────────────────────────────────────

/// Performs one GitHub API call on behalf of `account_id`, injecting its token from the keychain.
///
/// The single door every `api/github/*.api.ts` file goes through, replacing the six `fetch` sites
/// that used to sign their own requests in the webview. It returns the status alongside the body
/// because callers judge it themselves — a 404 from the releases endpoint means "no release for
/// this tag", not a failure — exactly as they did when they held a `Response`.
#[tauri::command]
pub async fn github_api_request(
    account_id: Option<String>,
    url: String,
    method: Option<String>,
    body: Option<serde_json::Value>,
    accept: Option<String>,
) -> Result<GithubApiResponse, String> {
    Ok(github_api::request(
        account_id.as_deref(),
        &url,
        method.as_deref().unwrap_or("GET"),
        body,
        accept.as_deref(),
    )
    .await?)
}

// ─── List User Repositories ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepoInfo {
    pub id: u64,
    pub name: String,
    #[serde(rename(deserialize = "full_name"))]
    pub full_name: String,
    pub private: bool,
    #[serde(rename(deserialize = "html_url"))]
    pub html_url: String,
    pub description: Option<String>,
    #[serde(rename(deserialize = "updated_at"))]
    pub updated_at: String,
}

/// Fetches the authenticated user's repositories — the list Settings shows next to the account.
#[tauri::command]
pub async fn github_list_repos(account_id: String) -> Result<Vec<GitHubRepoInfo>, String> {
    let res = github_api::request(
        Some(&account_id),
        "https://api.github.com/user/repos?per_page=100&sort=updated",
        "GET",
        None,
        None,
    )
    .await?;

    if !res.ok {
        eprintln!("[GitHub API] Repos request failed: HTTP {}", res.status);
        return Err(AppError::Unknown(format!(
            "Failed to fetch GitHub repositories (HTTP {})",
            res.status
        ))
        .into());
    }

    serde_json::from_str::<Vec<GitHubRepoInfo>>(&res.body).map_err(|e| {
        eprintln!("[GitHub API] Failed to parse repos response: {e}");
        AppError::Unknown(format!("Unreadable GitHub repositories response: {e}")).into()
    })
}

// ─── Commit Author Avatars ────────────────────────────────────────────────────

/// Resolves the GitHub avatar URL for each commit SHA in `shas` (deduplicated) via
/// `GET /repos/{owner}/{repo}/commits/{sha}`. Best-effort: SHAs whose author can't be resolved
/// (404, non-GitHub author, request error) are simply absent from the returned map, and the
/// frontend falls back to initials for those. Used by the diff viewer's blame gutter and history
/// panel to show real author photos when the repo lives on GitHub and an account is connected.
///
/// Keeps its own loop rather than calling the proxy once per SHA: the token is read from the
/// keychain once and one client serves every request, where the proxy would build both per call —
/// and on macOS a keychain read is not free.
#[tauri::command]
pub async fn github_commit_avatars(
    account_id: String,
    owner: String,
    repo: String,
    shas: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let token = credential_store::require_secret(CredentialKind::GitHub, &account_id)?;
    let client = github_api::http_client(15)?;

    let mut avatars: HashMap<String, String> = HashMap::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for sha in shas {
        if !seen.insert(sha.clone()) {
            continue;
        }

        let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/{sha}");
        let res = client
            .get(&url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "git-manager-desktop")
            .send()
            .await;

        let Ok(res) = res else { continue };
        if !res.status().is_success() {
            continue;
        }
        let Ok(data) = res.json::<serde_json::Value>().await else {
            continue;
        };

        if let Some(avatar) = data["author"]["avatar_url"].as_str() {
            if !avatar.is_empty() {
                avatars.insert(sha, avatar.to_string());
            }
        }
    }

    Ok(avatars)
}

// ─── Pull-Request Template Detection ──────────────────────────────────────────

/// Detects the repo's GitHub PR template(s) so the composer can pre-fill the description like
/// github.com. Filesystem-only (no network), so it lives in `services::pr_template`; this is just
/// the thin command boundary. Grouped with the other GitHub-support commands even though it reads
/// local files, mirroring how `github.rs` already hosts non-network helpers.
#[tauri::command]
pub fn get_pr_template(
    path: String,
) -> Result<crate::services::pr_template::PrTemplateDetection, String> {
    Ok(crate::services::pr_template::detect_pr_template(&path))
}
