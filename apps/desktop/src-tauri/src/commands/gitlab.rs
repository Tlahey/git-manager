use crate::error::AppError;
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// Application ID of the OAuth app registered on gitlab.com, so signing in there is one click —
/// exactly like `GITHUB_CLIENT_ID`.
///
/// It only means something on gitlab.com. Every GitLab instance keeps its own application registry,
/// so a self-hosted server has never heard of this id and the caller must pass its own (registered
/// by whoever administers that instance). GitHub Enterprise has the same property; it simply never
/// came up, because the app only ever talks to github.com.
const GITLAB_COM_CLIENT_ID: &str = "REPLACE_ME_WITH_THE_GITLAB_COM_APPLICATION_ID";

/// gitlab.com, and the default when no instance is given.
const GITLAB_COM_URL: &str = "https://gitlab.com";

/// Trims a trailing slash so `https://gitlab.com/` and `https://gitlab.com` build the same URL.
fn instance_base(instance_url: &str) -> String {
    let trimmed = instance_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        GITLAB_COM_URL.to_string()
    } else {
        trimmed.to_string()
    }
}

/// The client id to authenticate with: the caller's when it has one (self-hosted), otherwise the
/// shipped gitlab.com application.
fn resolve_client_id(client_id: Option<String>) -> Result<String, AppError> {
    let id = client_id
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| GITLAB_COM_CLIENT_ID.to_string());
    if id == GITLAB_COM_CLIENT_ID && GITLAB_COM_CLIENT_ID.starts_with("REPLACE_ME") {
        return Err(AppError::Unknown(
            "No GitLab application is configured. Register one on your instance and enter its \
             Application ID."
                .to_string(),
        ));
    }
    Ok(id)
}

fn http_client() -> Result<Client, AppError> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(AppError::Http)
}

// ─── Device Flow: Request Code ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitLabDeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    /// `verification_uri` with the code already in it — GitLab provides it, GitHub does not.
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

/// Requests a device authorization code from a GitLab instance.
///
/// Unlike GitHub's equivalent, the parameters are **form-encoded**, not JSON: GitLab's
/// `/oauth/authorize_device` is a Doorkeeper endpoint and ignores a JSON body, answering with an
/// `invalid_request` that names no field.
#[tauri::command]
pub async fn gitlab_device_code(
    instance_url: String,
    client_id: Option<String>,
    scope: String,
) -> Result<GitLabDeviceCodeResponse, String> {
    let base = instance_base(&instance_url);
    let id = resolve_client_id(client_id)?;

    let res = http_client()?
        .post(format!("{base}/oauth/authorize_device"))
        .header("Accept", "application/json")
        .form(&[("client_id", id.as_str()), ("scope", scope.as_str())])
        .send()
        .await
        .map_err(AppError::Http)?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        eprintln!("[GitLab OAuth] Device code request failed: HTTP {status}");
        return Err(AppError::Unknown(format!(
            "GitLab device authorization failed (HTTP {status}): {body}"
        ))
        .into());
    }

    let data: GitLabDeviceCodeResponse = res.json().await.map_err(AppError::Http)?;
    Ok(data)
}

// ─── Device Flow: Poll for the token ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitLabPollTokenResponse {
    /// Present once the user has approved the request.
    pub access_token: Option<String>,
    /// Present while waiting or on failure: `authorization_pending`, `slow_down`, `expired_token`,
    /// `access_denied`.
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Polls a GitLab instance for the access token behind a `device_code`.
///
/// A pending authorization comes back as HTTP 400 with `{"error": "authorization_pending"}` — an
/// error status carrying a perfectly normal answer — so the body is parsed before the status is
/// judged, and only an unparseable body is reported as a failure.
#[tauri::command]
pub async fn gitlab_poll_token(
    instance_url: String,
    client_id: Option<String>,
    device_code: String,
) -> Result<GitLabPollTokenResponse, String> {
    let base = instance_base(&instance_url);
    let id = resolve_client_id(client_id)?;

    let res = http_client()?
        .post(format!("{base}/oauth/token"))
        .header("Accept", "application/json")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code.as_str()),
            ("client_id", id.as_str()),
        ])
        .send()
        .await
        .map_err(AppError::Http)?;

    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    match serde_json::from_str::<GitLabPollTokenResponse>(&body) {
        Ok(data) => Ok(data),
        Err(_) => {
            eprintln!("[GitLab OAuth] Token poll failed: HTTP {status}");
            Err(
                AppError::Unknown(format!("GitLab token poll failed (HTTP {status}): {body}"))
                    .into(),
            )
        }
    }
}

// ─── Fetch User Profile ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitLabUserInfo {
    pub username: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitLabUserRaw {
    username: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

/// Fetches the authenticated user's profile — also the *validation* step: a token that cannot name
/// its own user is not a token worth storing.
#[tauri::command]
pub async fn gitlab_get_user(
    instance_url: String,
    token: String,
) -> Result<GitLabUserInfo, String> {
    let base = instance_base(&instance_url);
    let res = http_client()?
        .get(format!("{base}/api/v4/user"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(AppError::Http)?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(AppError::Unknown(format!(
            "GitLab profile request failed (HTTP {status}): {body}"
        ))
        .into());
    }

    let raw: GitLabUserRaw = res.json().await.map_err(AppError::Http)?;
    Ok(GitLabUserInfo {
        username: raw.username,
        name: raw.name,
        email: raw.email,
        avatar_url: raw.avatar_url,
    })
}
