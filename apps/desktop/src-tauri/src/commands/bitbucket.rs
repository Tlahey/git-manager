use crate::error::AppError;
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// Bitbucket Cloud's API host. Since 2026-05-04 every OAuth 2.0 request must go here (rather than
/// `bitbucket.org/api`) with the token as a Bearer header.
const BITBUCKET_API: &str = "https://api.bitbucket.org/2.0";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketUserInfo {
    /// Bitbucket's stable identifier. `username` is optional and can be absent on newer accounts,
    /// so the display name is what the UI shows and this is what identifies the account.
    pub account_id: String,
    pub display_name: String,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BitbucketUserRaw {
    account_id: String,
    display_name: String,
    nickname: Option<String>,
    links: Option<BitbucketLinks>,
}

#[derive(Debug, Deserialize)]
struct BitbucketLinks {
    avatar: Option<BitbucketHref>,
}

#[derive(Debug, Deserialize)]
struct BitbucketHref {
    href: Option<String>,
}

/// Verifies a Bitbucket app password / API token by asking who it belongs to.
///
/// Bitbucket is the one provider here that cannot use the device flow GitHub and GitLab share:
/// Atlassian supports only the authorization-code grant (which needs a redirect URI and so a local
/// HTTP server) and client credentials. A token typed in by hand is therefore the honest option —
/// but it has to be *checked*, which is what this does. The previous implementation was a
/// `setTimeout` that stored whatever had been typed, so a typo was indistinguishable from a
/// working account until something tried to use it.
#[tauri::command]
pub async fn bitbucket_get_user(
    username: String,
    token: String,
) -> Result<BitbucketUserInfo, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(AppError::Http)?;

    // App passwords authenticate with Basic (username + password); API tokens are sent the same
    // way, with the token as the password. Bearer is for OAuth 2.0 access tokens, which this is not.
    let res = client
        .get(format!("{BITBUCKET_API}/user"))
        .basic_auth(&username, Some(&token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(AppError::Http)?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        // 401/403 is a wrong credential, not a broken server: say so plainly rather than dumping
        // Atlassian's HTML error page into a toast.
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err(AppError::Unknown(
                "Bitbucket rejected those credentials. Check the username and the app password / \
                 API token, and that it grants at least Account: Read."
                    .to_string(),
            )
            .into());
        }
        return Err(AppError::Unknown(format!(
            "Bitbucket profile request failed (HTTP {status}): {body}"
        ))
        .into());
    }

    let raw: BitbucketUserRaw = res.json().await.map_err(AppError::Http)?;
    Ok(BitbucketUserInfo {
        account_id: raw.account_id,
        display_name: raw.display_name,
        nickname: raw.nickname,
        avatar_url: raw.links.and_then(|l| l.avatar).and_then(|a| a.href),
    })
}
