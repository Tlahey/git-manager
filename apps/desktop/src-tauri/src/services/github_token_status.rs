//! What GitHub says about the credential that signed a request, read off two response headers.
//!
//! Both answer questions the body cannot. A SAML-protected organization refuses an unauthorized
//! token with a plain `403` whose body says nothing actionable — the organization to authorize for,
//! and the URL that authorizes it, are only in `X-GitHub-SSO`. And a personal access token's expiry
//! date is not readable from the token, not returned by any endpoint, and not something the user is
//! asked for when pasting one: `github-authentication-token-expiration` is the only place the app
//! can learn it, and GitHub sends it on every authenticated response.
//!
//! # Why this is read on every response rather than once at connect time
//!
//! Both facts change underneath the app without it doing anything. An organization can enable SAML,
//! or revoke a token's authorization, long after the account was connected; a regenerated token
//! carries a new expiry and may or may not keep its SSO authorization. Deciding either at connect
//! time would leave the app confidently showing a stale answer — the specific failure being an
//! "authorized" account whose every request quietly 403s, which is what an empty repository list
//! used to look like. Reading the live header means the app corrects itself on the next request,
//! whichever way the change went.

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};

/// GitHub's `X-GitHub-SSO` header, parsed.
///
/// Two forms exist and they mean different things:
/// `required; url=https://github.com/orgs/acme/sso?authorization_request=…` is a refusal, and the
/// URL is the one-click fix; `partial-results; organizations=1234,5678` accompanies a *successful*
/// GraphQL response that silently omitted some organizations' data. Both are worth surfacing, so
/// [`required`](Self::required) distinguishes them rather than the parser dropping one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSsoChallenge {
    /// `true` for `required` — the request was refused pending authorization.
    pub required: bool,
    /// Organization ids GitHub named, when it named any (the `partial-results` form).
    pub organizations: Vec<String>,
    /// The single-sign-on URL to send the user to, when GitHub supplied one.
    pub authorize_url: Option<String>,
}

/// Parses an `X-GitHub-SSO` header value, or `None` when it carries no directive we understand.
///
/// The header is a `;`-separated list whose first element is the status and whose rest are
/// `key=value` pairs. A value is taken verbatim — the `url` is a GitHub-issued authorization link
/// with a signed `authorization_request` parameter, and re-encoding it would break it.
pub fn parse_sso_header(value: &str) -> Option<GitHubSsoChallenge> {
    let mut parts = value.split(';').map(str::trim).filter(|p| !p.is_empty());
    let status = parts.next()?;

    let mut challenge = GitHubSsoChallenge {
        required: status.eq_ignore_ascii_case("required"),
        organizations: Vec::new(),
        authorize_url: None,
    };

    for part in parts {
        let Some((key, val)) = part.split_once('=') else {
            continue;
        };
        let val = val.trim();
        match key.trim().to_ascii_lowercase().as_str() {
            "url" => challenge.authorize_url = Some(val.to_string()),
            "organizations" => {
                challenge.organizations = val
                    .split(',')
                    .map(str::trim)
                    .filter(|o| !o.is_empty())
                    .map(str::to_string)
                    .collect()
            }
            _ => {}
        }
    }

    // A header naming neither a status we recognize nor anything to act on is not worth reporting:
    // it would put a banner on screen with no organization to name and no button to offer.
    if !challenge.required
        && challenge.organizations.is_empty()
        && challenge.authorize_url.is_none()
    {
        return None;
    }
    Some(challenge)
}

/// Parses `github-authentication-token-expiration` into an RFC 3339 timestamp.
///
/// Normalized in Rust rather than passed through raw because GitHub's own format
/// (`2026-12-01 15:00:00 UTC`) is not one `Date` parses reliably across engines, and the frontend
/// has to do date arithmetic on it to decide whether a token expires this week.
pub fn parse_token_expiration(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    // The two shapes GitHub is known to send, then RFC 3339 as a hedge against a third.
    if let Some(naive) = value
        .strip_suffix("UTC")
        .map(str::trim)
        .and_then(|v| NaiveDateTime::parse_from_str(v, "%Y-%m-%d %H:%M:%S").ok())
    {
        return Some(naive.and_utc().to_rfc3339());
    }
    if let Ok(dt) = DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S %z") {
        return Some(dt.with_timezone(&Utc).to_rfc3339());
    }
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc).to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_refusal_form_and_keeps_the_url_verbatim() {
        let url = "https://github.com/orgs/acme/sso?authorization_request=AZSCKtL4U8yX1H3sCQIVvEne72eah021";
        let parsed = parse_sso_header(&format!("required; url={url}")).expect("a challenge");
        assert!(parsed.required);
        // The signed parameter must survive intact — a re-encoded URL is a dead link.
        assert_eq!(parsed.authorize_url.as_deref(), Some(url));
    }

    #[test]
    fn reads_the_partial_results_form_as_a_non_refusal() {
        let parsed = parse_sso_header("partial-results; organizations=21955855,20582480")
            .expect("a challenge");
        assert!(!parsed.required);
        assert_eq!(parsed.organizations, vec!["21955855", "20582480"]);
        assert_eq!(parsed.authorize_url, None);
    }

    #[test]
    fn ignores_a_header_with_nothing_to_act_on() {
        assert_eq!(parse_sso_header(""), None);
        assert_eq!(parse_sso_header("something-else"), None);
    }

    #[test]
    fn reads_githubs_own_expiration_format() {
        assert_eq!(
            parse_token_expiration("2026-12-01 15:00:00 UTC").as_deref(),
            Some("2026-12-01T15:00:00+00:00")
        );
    }

    #[test]
    fn reads_an_offset_expiration_and_normalizes_it_to_utc() {
        assert_eq!(
            parse_token_expiration("2026-12-01 15:00:00 +0100").as_deref(),
            Some("2026-12-01T14:00:00+00:00")
        );
    }

    #[test]
    fn ignores_an_absent_or_unparseable_expiration() {
        assert_eq!(parse_token_expiration(""), None);
        assert_eq!(parse_token_expiration("never"), None);
    }
}
