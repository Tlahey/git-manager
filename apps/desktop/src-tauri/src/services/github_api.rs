//! Every GitHub HTTP call the app makes, and the only place its token is ever read.
//!
//! The frontend used to sign its own requests with `fetch`, which is *why* the token had to be
//! persisted somewhere the webview could read. Turning that around is the point of this module: the
//! token lives in the OS keychain (`services/credential_store.rs`), Rust looks it up by account id
//! and puts it on the wire, and the JavaScript side only ever names an account.
//!
//! # The URL allowlist is load-bearing
//!
//! [`request`] takes a URL from the frontend, so without a guard "attach my GitHub token to this
//! request" would also mean "attach my GitHub token to *any* request" — a compromised or merely
//! buggy frontend could exfiltrate the credential by naming its own host, and it would have gained
//! back, through Rust, exactly the capability moving the token here removed. So the URL must be an
//! `https://api.github.com/…` one. Callers that need a different GitHub host (the OAuth endpoints
//! live on `github.com`) get their own command rather than a hole in this check.

use crate::error::AppError;
use crate::services::credential_store::{self, CredentialKind};
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// GitHub rejects an API request with no `User-Agent`. The webview used to supply a browser's.
const USER_AGENT: &str = "git-manager-desktop";

const DEFAULT_ACCEPT: &str = "application/vnd.github.v3+json";

/// The only origin a token is ever attached to — see the module comment.
const API_ORIGIN: &str = "https://api.github.com/";

pub fn http_client(timeout_secs: u64) -> Result<Client, AppError> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(AppError::Http)
}

/// One GitHub response, as the frontend sees it.
///
/// The body stays a `String` rather than a parsed `serde_json::Value` because not every response is
/// JSON — the contents API's `raw` media type returns file text, which is how the PR diff viewer
/// reads a file at a ref. The caller knows which it asked for, so it does the parsing.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GithubApiResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
}

fn guard_url(url: &str) -> Result<(), AppError> {
    if !url.starts_with(API_ORIGIN) {
        return Err(AppError::InvalidInput(format!(
            "Refusing to send a GitHub credential to a non-GitHub URL: {url}"
        )));
    }
    Ok(())
}

/// Performs one authenticated (or anonymous) GitHub API call.
///
/// `account_id` absent means an anonymous request — a handful of reads (a public repo's default
/// branch, a tag's release page) work signed out, and the frontend already treated the token as
/// optional for those. A *named* account whose keychain entry is missing is an error rather than a
/// silent downgrade to anonymous: the caller asked to act as someone, and quietly acting as nobody
/// would surface as a confusing 404 on a private repository.
///
/// A non-2xx status is returned, not raised. GitHub answers perfectly ordinary questions with an
/// error status — a 404 from the releases endpoint means "this tag has no release" — so judging the
/// status is the caller's job, exactly as it was when the caller held a `Response`.
pub async fn request(
    account_id: Option<&str>,
    url: &str,
    method: &str,
    body: Option<serde_json::Value>,
    accept: Option<&str>,
) -> Result<GithubApiResponse, AppError> {
    guard_url(url)?;

    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| AppError::InvalidInput(format!("Unsupported HTTP method: {method}")))?;

    let mut req = http_client(30)?
        .request(method, url)
        .header("Accept", accept.unwrap_or(DEFAULT_ACCEPT))
        .header("User-Agent", USER_AGENT);

    if let Some(id) = account_id.filter(|id| !id.is_empty()) {
        let token = credential_store::require_secret(CredentialKind::GitHub, id)?;
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    if let Some(payload) = body {
        req = req.json(&payload);
    }

    let res = req.send().await.map_err(AppError::Http)?;
    let status = res.status();
    let text = res.text().await.map_err(AppError::Http)?;

    Ok(GithubApiResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        body: text,
    })
}

// ─── Account connection ───────────────────────────────────────────────────────

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

/// Fetches the profile a raw token belongs to — also the validation step, since a token that cannot
/// name its own user is not a token worth storing.
///
/// Takes the token itself rather than an account id because it runs *before* there is an account:
/// this is what turns "some string the user pasted" into "the account called octocat".
async fn fetch_user(token: &str) -> Result<GitHubUserInfo, AppError> {
    let client = http_client(15)?;

    let user_res = client
        .get("https://api.github.com/user")
        .header("Accept", DEFAULT_ACCEPT)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(AppError::Http)?;

    if !user_res.status().is_success() {
        let status = user_res.status();
        eprintln!("[GitHub API] User profile request failed: HTTP {status}");
        return Err(AppError::Unknown(format!(
            "Failed to fetch GitHub user profile (HTTP {status})"
        )));
    }

    let user_data: serde_json::Value = user_res.json().await.map_err(AppError::Http)?;

    let login = user_data["login"].as_str().unwrap_or_default().to_string();
    let name = user_data["name"].as_str().map(|s| s.to_string());
    let avatar_url = user_data["avatar_url"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let mut email = user_data["email"].as_str().map(|s| s.to_string());

    // The primary address is often not on the public profile, so it takes a second call. Best
    // effort: a token without `user:email` still gives a perfectly usable account.
    let emails_res = client
        .get("https://api.github.com/user/emails")
        .header("Accept", DEFAULT_ACCEPT)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
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
                }
            }
        }
    }

    if login.is_empty() {
        return Err(AppError::Unknown(
            "GitHub returned a profile with no login".to_string(),
        ));
    }

    Ok(GitHubUserInfo {
        login,
        name,
        email,
        avatar_url,
    })
}

/// Validates a token, files it in the keychain under the login it belongs to, and hands back only
/// the public profile.
///
/// The one place a raw GitHub token enters the app, and it leaves again immediately: the caller —
/// the personal-access-token form, or the device flow's final poll — gets a `GitHubUserInfo` and no
/// way to ask for the credential behind it. The account id *is* the login, which is what makes
/// signing in twice as the same user replace an entry rather than add a second one.
pub async fn connect_account(token: &str) -> Result<GitHubUserInfo, AppError> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::InvalidInput("The token is empty".to_string()));
    }
    let user = fetch_user(token).await?;
    credential_store::set_secret(CredentialKind::GitHub, &user.login, token)?;
    Ok(user)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_github_api_origin() {
        assert!(guard_url("https://api.github.com/user/repos").is_ok());
    }

    #[test]
    fn refuses_any_other_host() {
        // The exfiltration this guard exists to stop: a frontend naming its own collector.
        assert!(guard_url("https://evil.example/collect").is_err());
        // And the near-misses — a look-alike host and a downgraded scheme.
        assert!(guard_url("https://api.github.com.evil.example/user").is_err());
        assert!(guard_url("http://api.github.com/user").is_err());
        // github.com is not api.github.com: the OAuth endpoints there have their own commands.
        assert!(guard_url("https://github.com/login/oauth/access_token").is_err());
    }
}
