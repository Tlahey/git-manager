use crate::error::AppError;
use reqwest::Client;
use serde::{Deserialize, Serialize};

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
    println!(
        "[GitHub OAuth] Requesting device authorization code for scopes: {}",
        scope
    );
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
        println!(
            "[GitHub OAuth] Device code request failed: Status {}, Body {}",
            status, body
        );
        return Err(AppError::Unknown(format!(
            "GitHub device code request failed (HTTP {}): {}",
            status, body
        ))
        .into());
    }

    let data: DeviceCodeResponse = res.json().await.map_err(AppError::Http)?;
    println!(
        "[GitHub OAuth] Device code response: user_code={}, verification_uri={}, device_code_prefix={}",
        data.user_code,
        data.verification_uri,
        &data.device_code[..std::cmp::min(8, data.device_code.len())]
    );
    Ok(data)
}

// ─── Device Flow: Poll for Token ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PollTokenResponse {
    /// Present when authorization is complete
    pub access_token: Option<String>,
    /// Present while waiting or on error: "authorization_pending", "slow_down", "expired_token", "access_denied"
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Polls GitHub for an access token using the device_code.
/// Returns the token when ready, or an error status if still pending.
#[tauri::command]
pub async fn github_poll_token(device_code: String) -> Result<PollTokenResponse, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(AppError::Http)?;

    println!(
        "[GitHub OAuth] Polling for token with device_code_prefix={}",
        &device_code[..std::cmp::min(8, device_code.len())]
    );

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
        println!(
            "[GitHub OAuth] Token poll failed: Status {}, Body {}",
            status, body
        );
        return Err(AppError::Unknown(format!(
            "GitHub token poll failed (HTTP {}): {}",
            status, body
        ))
        .into());
    }

    let data: PollTokenResponse = res.json().await.map_err(AppError::Http)?;
    println!(
        "[GitHub OAuth] Poll response for device_code_prefix={}: has_token={}, error={:?}",
        &device_code[..std::cmp::min(8, device_code.len())],
        data.access_token.is_some(),
        data.error
    );
    Ok(data)
}

// ─── Fetch User Profile ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserInfo {
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubEmailEntry {
    email: String,
    primary: bool,
    verified: bool,
}

/// Fetches the authenticated user's profile and primary email from GitHub.
#[tauri::command]
pub async fn github_get_user(token: String) -> Result<GitHubUserInfo, String> {
    println!("[GitHub API] Fetching user profile info...");
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(AppError::Http)?;

    // Fetch user profile
    let user_res = client
        .get("https://api.github.com/user")
        .header("Accept", "application/vnd.github.v3+json")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "git-manager-desktop")
        .send()
        .await
        .map_err(AppError::Http)?;

    if !user_res.status().is_success() {
        let status = user_res.status();
        let body = user_res.text().await.unwrap_or_default();
        println!(
            "[GitHub API] User profile request failed: Status {}, Body {}",
            status, body
        );
        return Err(AppError::Unknown(format!(
            "Failed to fetch GitHub user profile (HTTP {})",
            status
        ))
        .into());
    }

    let user_data: serde_json::Value = user_res.json().await.map_err(AppError::Http)?;

    let login = user_data["login"].as_str().unwrap_or_default().to_string();
    let name = user_data["name"].as_str().map(|s| s.to_string());
    let avatar_url = user_data["avatar_url"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let mut email = user_data["email"].as_str().map(|s| s.to_string());

    println!(
        "[GitHub API] Profile fetched: login={}, name={:?}",
        login, name
    );

    // Fetch primary email (may not be public on profile)
    let emails_res = client
        .get("https://api.github.com/user/emails")
        .header("Accept", "application/vnd.github.v3+json")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "git-manager-desktop")
        .send()
        .await;

    if let Ok(res) = emails_res {
        if res.status().is_success() {
            if let Ok(emails) = res.json::<Vec<GitHubEmailEntry>>().await {
                let primary = emails
                    .iter()
                    .find(|e| e.primary && e.verified)
                    .or_else(|| emails.first());
                if let Some(entry) = primary {
                    email = Some(entry.email.clone());
                    println!("[GitHub API] Primary email resolved: {}", entry.email);
                }
            }
        }
    }

    Ok(GitHubUserInfo {
        login,
        name,
        email,
        avatar_url,
    })
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

/// Fetches the authenticated user's repositories from GitHub.
#[tauri::command]
pub async fn github_list_repos(token: String) -> Result<Vec<GitHubRepoInfo>, String> {
    println!("[GitHub API] Listing user repositories...");
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(AppError::Http)?;

    let res_result = client
        .get("https://api.github.com/user/repos?per_page=100&sort=updated")
        .header("Accept", "application/vnd.github.v3+json")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "git-manager-desktop")
        .send()
        .await;

    let res = match res_result {
        Ok(r) => r,
        Err(e) => {
            println!("[GitHub API] Listing repos failed on send: {:?}", e);
            return Err(AppError::Http(e).into());
        }
    };

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        println!(
            "[GitHub API] Repos request failed: Status {}, Body {}",
            status, body
        );
        return Err(AppError::Unknown(format!(
            "Failed to fetch GitHub repositories (HTTP {})",
            status
        ))
        .into());
    }

    let repos_result = res.json::<Vec<GitHubRepoInfo>>().await;
    let repos = match repos_result {
        Ok(r) => r,
        Err(e) => {
            println!("[GitHub API] Deserialization of repos JSON failed: {:?}", e);
            return Err(AppError::Http(e).into());
        }
    };

    println!(
        "[GitHub API] Successfully listed {} repositories.",
        repos.len()
    );
    Ok(repos)
}
