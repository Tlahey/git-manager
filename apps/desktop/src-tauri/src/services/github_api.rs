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
use crate::services::github_etag_cache;
use crate::services::github_rate_limit::{parse_rate_limit, parse_retry_after, GitHubRateLimit};
use crate::services::github_token_status::{
    parse_sso_header, parse_token_expiration, GitHubSsoChallenge,
};
use reqwest::header::HeaderMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// GitHub rejects an API request with no `User-Agent`. The webview used to supply a browser's.
const USER_AGENT: &str = "git-manager-desktop";

const DEFAULT_ACCEPT: &str = "application/vnd.github.v3+json";

/// The only origin a token is ever attached to — see the module comment.
const API_ORIGIN: &str = "https://api.github.com/";

/// Names an organization whose SAML single sign-on the token has not been authorized for.
const SSO_HEADER: &str = "x-github-sso";

/// When the personal access token that signed this request expires.
const TOKEN_EXPIRATION_HEADER: &str = "github-authentication-token-expiration";

/// How much of the quota is left — see `github_rate_limit`.
const RATE_LIMIT_HEADER: &str = "x-ratelimit-limit";
const RATE_REMAINING_HEADER: &str = "x-ratelimit-remaining";
const RATE_RESET_HEADER: &str = "x-ratelimit-reset";
const RATE_RESOURCE_HEADER: &str = "x-ratelimit-resource";

/// How long GitHub asks the app to wait after a secondary rate limit.
const RETRY_AFTER_HEADER: &str = "retry-after";

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
    /// GitHub's SAML single-sign-on verdict on this request, when it gave one.
    ///
    /// *Named* headers are surfaced here, not the whole header map: a caller that could read any
    /// response header could read `Set-Cookie` too, and widening this to "the headers" would be a
    /// decision made by accident rather than in a diff. Adding one is a line in this struct.
    pub sso: Option<GitHubSsoChallenge>,
    /// RFC 3339 expiry of the token that signed this request — see `github_token_status`.
    pub token_expires_at: Option<String>,
    /// How much of the quota this request's bucket has left — see `github_rate_limit`.
    pub rate_limit: Option<GitHubRateLimit>,
    /// Seconds GitHub asked the app to wait before retrying, on the responses that ask.
    pub retry_after_secs: Option<u64>,
    /// `true` when GitHub answered `304 Not Modified` and the body below came from
    /// `github_etag_cache` rather than the wire. The data is identical either way — this says only
    /// that the request cost nothing against the quota, which is what makes the saving observable
    /// instead of a claim.
    pub from_cache: bool,
}

/// Reads the two credential-status headers off a response — see `github_token_status`.
fn read_token_status(headers: &HeaderMap) -> (Option<GitHubSsoChallenge>, Option<String>) {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    (
        header(SSO_HEADER).and_then(parse_sso_header),
        header(TOKEN_EXPIRATION_HEADER).and_then(parse_token_expiration),
    )
}

/// Reads the quota headers off a response — see `github_rate_limit`.
fn read_rate_limit(headers: &HeaderMap) -> (Option<GitHubRateLimit>, Option<u64>) {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    (
        parse_rate_limit(
            header(RATE_LIMIT_HEADER),
            header(RATE_REMAINING_HEADER),
            header(RATE_RESET_HEADER),
            header(RATE_RESOURCE_HEADER),
        ),
        header(RETRY_AFTER_HEADER).and_then(parse_retry_after),
    )
}

fn guard_url(url: &str) -> Result<(), AppError> {
    if !url.starts_with(API_ORIGIN) {
        return Err(AppError::InvalidInput(format!(
            "Refusing to send a GitHub credential to a non-GitHub URL: {url}"
        )));
    }
    Ok(())
}

/// Rewrites an already-`guard_url`-approved request to a local fake server, for the e2e suite's
/// GitHub API mock mode (see `docs/architecture/2026-08-e2e-github-api-mock-mode.md`).
///
/// Runs strictly after `guard_url`: the frontend must still name a literal `https://api.github.com/…`
/// URL, so the anti-exfiltration guarantee that check exists for is untouched. This only decides
/// where that already-approved request actually goes on the wire, and only in an `e2e` build — the
/// `#[cfg(not(feature = "e2e"))]` twin below is the identity function and never reads the env var, so
/// a release binary carries no code path that could be pointed anywhere but `api.github.com`.
///
/// Reads the env var fresh on every call rather than caching it, matching
/// `credential_store::active_backend_kind`'s own reasoning: cheap, and it means the e2e suite only
/// has to set it once before the app starts, with nothing here needing to coordinate further.
#[cfg(feature = "e2e")]
fn e2e_redirect(url: &str) -> String {
    match std::env::var("GIT_MANAGER_GITHUB_API_BASE_URL") {
        Ok(base) if !base.trim().is_empty() => url.replacen(
            API_ORIGIN,
            &format!("{}/", base.trim().trim_end_matches('/')),
            1,
        ),
        _ => url.to_string(),
    }
}

#[cfg(not(feature = "e2e"))]
fn e2e_redirect(url: &str) -> String {
    url.to_string()
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
///
/// A `GET` is sent conditionally when the same request has been answered before: see
/// `github_etag_cache` for why, and for the guarantee that one account's body is never replayed for
/// another. A `304` never reaches the caller — it is turned back into the `200` and the body the
/// caller expects, with `from_cache` set.
pub async fn request(
    account_id: Option<&str>,
    url: &str,
    method: &str,
    body: Option<serde_json::Value>,
    accept: Option<&str>,
) -> Result<GithubApiResponse, AppError> {
    guard_url(url)?;
    let effective_url = e2e_redirect(url);

    // Kept as its own `String` because the `Method` below is moved into the request builder, and
    // every log line here still needs to name the verb.
    let verb = method.to_uppercase();
    let method = reqwest::Method::from_bytes(verb.as_bytes())
        .map_err(|_| AppError::InvalidInput(format!("Unsupported HTTP method: {method}")))?;

    let accept_header = accept.unwrap_or(DEFAULT_ACCEPT);
    // Only a GET is ever cached — a write has no business being answered from memory, and GitHub
    // does not tag one anyway.
    let conditional = verb == "GET";

    let mut req = http_client(30)?
        .request(method, effective_url.as_str())
        .header("Accept", accept_header)
        .header("User-Agent", USER_AGENT);

    // Held for the whole call rather than fetched again when the `304` lands: see
    // `github_etag_cache::lookup` for why the body travels with the etag.
    let cached = conditional
        .then(|| github_etag_cache::lookup(account_id, url, accept_header))
        .flatten();
    if let Some(hit) = &cached {
        req = req.header("If-None-Match", hit.etag.as_str());
    }

    if let Some(id) = account_id.filter(|id| !id.is_empty()) {
        let token =
            credential_store::require_secret(CredentialKind::GitHub, id).inspect_err(|e| {
                eprintln!("[GitHub API] {verb} {url} — no usable credential for '{id}': {e}")
            })?;
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    if let Some(payload) = body {
        req = req.json(&payload);
    }

    let res = req
        .send()
        .await
        .inspect_err(|e| eprintln!("[GitHub API] {verb} {url} — transport error: {e}"))
        .map_err(AppError::Http)?;
    let status = res.status();
    let (sso, token_expires_at) = read_token_status(res.headers());
    let (rate_limit, retry_after_secs) = read_rate_limit(res.headers());
    let etag = res
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    // The whole point of the conditional request: GitHub declined to resend an unchanged body, and
    // did not bill the quota for it. The caller is handed the `200` it was expecting.
    if status == reqwest::StatusCode::NOT_MODIFIED {
        if let Some(hit) = cached {
            return Ok(GithubApiResponse {
                status: 200,
                ok: true,
                body: hit.body,
                sso,
                token_expires_at,
                rate_limit,
                retry_after_secs,
                from_cache: true,
            });
        }
        // A 304 we cannot honour means the app sent an `If-None-Match` it no longer has the body
        // for, which `lookup` holding both is meant to make impossible. Returning the empty body
        // would read as an empty list, so it is surfaced as the error it is.
        eprintln!("[GitHub API] {verb} {url} — 304 with no cached body; treating as a failure");
        return Err(AppError::Unknown(
            "GitHub answered 304 for a response that is no longer cached".to_string(),
        ));
    }

    let text = res.text().await.map_err(AppError::Http)?;

    // Only a successful GET is worth remembering. An error body must never be stored: a 404 carries
    // an `ETag` of its own, and caching it would let a repository that later becomes visible go on
    // answering "not found" from memory.
    if conditional && status.is_success() {
        if let Some(etag) = etag {
            github_etag_cache::store(account_id, url, accept_header, &etag, &text);
        }
    }

    // A non-2xx is a legitimate answer here (a 404 from the releases endpoint means "no release"),
    // so it is still returned rather than raised — but it is logged, because the frontend turns some
    // of these into an empty list, and an unauthenticated 401 that reads as "nothing to show" is
    // exactly the kind of failure that otherwise leaves no trace anywhere.
    if !status.is_success() {
        let anon = if account_id.is_some_and(|id| !id.is_empty()) {
            ""
        } else {
            " (anonymous request)"
        };
        // Naming the SSO case in the log too: a 403 on an organization repository is otherwise
        // indistinguishable from a permissions problem, and it is the one with a one-click fix.
        let sso_note = match &sso {
            Some(c) if c.required => " — SAML SSO authorization required for this token",
            _ => "",
        };
        // The quota is named on failures too: a spent allowance and a missing permission are both a
        // 403, and this log line is the only place the difference is visible after the fact.
        let quota_note = match &rate_limit {
            Some(q) if q.remaining == 0 => {
                format!(
                    " — {} rate limit exhausted, resets at {}",
                    q.resource, q.reset
                )
            }
            _ => String::new(),
        };
        eprintln!("[GitHub API] {verb} {url} — HTTP {status}{anon}{sso_note}{quota_note}");
    }

    Ok(GithubApiResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        body: text,
        sso,
        token_expires_at,
        rate_limit,
        retry_after_secs,
        from_cache: false,
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
    /// RFC 3339 expiry of the token just connected, when it has one.
    ///
    /// Read here rather than asked of the user: GitHub declares it on the very response that
    /// validates the token, so connecting an account already knows when it will stop working. A
    /// token with no expiry (a classic PAT set to never expire) simply leaves this `None`.
    pub token_expires_at: Option<String>,
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
        .get(e2e_redirect("https://api.github.com/user"))
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

    let (_, token_expires_at) = read_token_status(user_res.headers());
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
        .get(e2e_redirect("https://api.github.com/user/emails"))
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
        token_expires_at,
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

    // Guards a real env var for the duration of one test — `std::env` is process-global, and Rust
    // runs unit tests on multiple threads by default, so two tests touching the same variable
    // without serializing would race. A `Mutex` held for the closure's duration is enough because
    // every test that reads `GIT_MANAGER_GITHUB_API_BASE_URL` goes through this helper.
    #[cfg(feature = "e2e")]
    fn with_env_var<T>(value: Option<&str>, f: impl FnOnce() -> T) -> T {
        use std::sync::Mutex;
        static ENV_LOCK: Mutex<()> = Mutex::new(());
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        match value {
            Some(v) => std::env::set_var("GIT_MANAGER_GITHUB_API_BASE_URL", v),
            None => std::env::remove_var("GIT_MANAGER_GITHUB_API_BASE_URL"),
        }
        let result = f();
        std::env::remove_var("GIT_MANAGER_GITHUB_API_BASE_URL");
        result
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_redirect_rewrites_only_the_origin_when_the_env_var_is_set() {
        with_env_var(Some("http://127.0.0.1:4567"), || {
            assert_eq!(
                e2e_redirect("https://api.github.com/repos/octocat/demo/pulls/1"),
                "http://127.0.0.1:4567/repos/octocat/demo/pulls/1"
            );
        });
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_redirect_strips_a_trailing_slash_on_the_configured_base() {
        with_env_var(Some("http://127.0.0.1:4567/"), || {
            assert_eq!(
                e2e_redirect("https://api.github.com/graphql"),
                "http://127.0.0.1:4567/graphql"
            );
        });
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_redirect_is_a_no_op_when_the_env_var_is_unset_or_blank() {
        with_env_var(None, || {
            assert_eq!(
                e2e_redirect("https://api.github.com/user"),
                "https://api.github.com/user"
            );
        });
        with_env_var(Some("   "), || {
            assert_eq!(
                e2e_redirect("https://api.github.com/user"),
                "https://api.github.com/user"
            );
        });
    }

    // Outside the `e2e` feature, `e2e_redirect` must be the identity function — this is the
    // guarantee a release binary relies on, so it is asserted with no feature flag at all rather
    // than only under `not(feature = "e2e")`, which `cargo test` already runs by default.
    #[cfg(not(feature = "e2e"))]
    #[test]
    fn e2e_redirect_is_always_the_identity_function_outside_e2e_builds() {
        assert_eq!(
            e2e_redirect("https://api.github.com/user/repos"),
            "https://api.github.com/user/repos"
        );
    }
}
