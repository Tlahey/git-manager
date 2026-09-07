//! What GitHub says about how much of the quota is left, read off the `x-ratelimit-*` headers.
//!
//! The app polls: a pull-request list every minute, an open PR's details every thirty seconds, its
//! mergeability every twenty, one search per saved filter. None of that was ever measured against
//! the 5000 requests an hour a personal token gets — the headers were on every response and nothing
//! read them, so the first thing the user learned about exhausting the quota was a `403` that
//! several callers turn into an empty list. "You have no pull requests" is the worst possible way to
//! render "come back in nineteen minutes".
//!
//! Reading them costs nothing and gives the frontend two things it cannot derive: how close it is
//! (so polling can back off *before* the wall) and, on the far side of a secondary rate limit, the
//! `Retry-After` GitHub explicitly asks to be honoured.
//!
//! # The buckets are separate, and the difference matters
//!
//! `x-ratelimit-resource` names which allowance a response was billed to — `core` for ordinary REST,
//! `search` for `search/issues` (a much tighter 30/minute), `graphql` for the v4 endpoint. They are
//! independent: spending the search budget on saved PR filters must not stop the app from fetching a
//! diff. Anything that throttles on these numbers has to do it per resource, which is why the name
//! is carried through rather than collapsed here.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// GitHub's `x-ratelimit-*` headers for one response, parsed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRateLimit {
    /// Requests this bucket allows per window.
    pub limit: u32,
    /// Requests left in the current window. A `304` does not decrement it — that is the whole point
    /// of `github_etag_cache`.
    pub remaining: u32,
    /// Unix epoch seconds at which `remaining` returns to `limit`.
    pub reset: i64,
    /// Which allowance was billed: `core`, `search`, `graphql`… Defaults to `core` when GitHub omits
    /// it, which is what an older response looks like.
    pub resource: String,
}

/// Reads the quota headers, or `None` when the response carried none.
///
/// All three of limit/remaining/reset are required: two of them describe a state nothing can act on
/// (how close is "47 left" without knowing of what, or until when?), and a partial reading would be
/// worse than none — it would let a throttle make a decision from a number it half understands.
pub fn parse_rate_limit(
    limit: Option<&str>,
    remaining: Option<&str>,
    reset: Option<&str>,
    resource: Option<&str>,
) -> Option<GitHubRateLimit> {
    let limit = limit?.trim().parse::<u32>().ok()?;
    let remaining = remaining?.trim().parse::<u32>().ok()?;
    let reset = reset?.trim().parse::<i64>().ok()?;
    let resource = resource
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .unwrap_or("core")
        .to_string();
    Some(GitHubRateLimit {
        limit,
        remaining,
        reset,
        resource,
    })
}

/// Parses `Retry-After` into a number of seconds to wait.
///
/// GitHub sends plain seconds on a secondary rate limit, but the header is also allowed to be an
/// HTTP date, so both are read — a date in the past (or a clock skewed the wrong way) yields `0`
/// rather than a negative wait, since "retry immediately" is the only sensible reading of it.
pub fn parse_retry_after(value: &str) -> Option<u64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if let Ok(secs) = value.parse::<u64>() {
        return Some(secs);
    }
    let at = DateTime::parse_from_rfc2822(value).ok()?;
    let delta = at.with_timezone(&Utc) - Utc::now();
    Some(delta.num_seconds().max(0) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_complete_set_of_headers() {
        let parsed = parse_rate_limit(Some("5000"), Some("4987"), Some("1789000000"), Some("core"))
            .expect("a reading");
        assert_eq!(parsed.limit, 5000);
        assert_eq!(parsed.remaining, 4987);
        assert_eq!(parsed.reset, 1789000000);
        assert_eq!(parsed.resource, "core");
    }

    #[test]
    fn keeps_the_resource_name_so_buckets_stay_separate() {
        // The tight one: `search` is 30/minute and independent of `core`'s 5000/hour.
        let parsed = parse_rate_limit(Some("30"), Some("2"), Some("1789000060"), Some("search"))
            .expect("a reading");
        assert_eq!(parsed.resource, "search");
    }

    #[test]
    fn defaults_the_resource_to_core_when_github_omits_it() {
        let parsed =
            parse_rate_limit(Some("5000"), Some("1"), Some("1789000000"), None).expect("a reading");
        assert_eq!(parsed.resource, "core");
        let blank = parse_rate_limit(Some("5000"), Some("1"), Some("1789000000"), Some("  "))
            .expect("a reading");
        assert_eq!(blank.resource, "core");
    }

    #[test]
    fn refuses_a_partial_reading() {
        // Half a quota is not a smaller quota — it is a number a throttle would misuse.
        assert_eq!(
            parse_rate_limit(Some("5000"), None, Some("1789000000"), None),
            None
        );
        assert_eq!(
            parse_rate_limit(None, Some("10"), Some("1789000000"), None),
            None
        );
        assert_eq!(parse_rate_limit(Some("5000"), Some("10"), None, None), None);
        assert_eq!(
            parse_rate_limit(Some("many"), Some("10"), Some("1789000000"), None),
            None
        );
    }

    #[test]
    fn reads_retry_after_as_seconds() {
        assert_eq!(parse_retry_after("60"), Some(60));
        assert_eq!(parse_retry_after(" 5 "), Some(5));
    }

    #[test]
    fn reads_retry_after_as_an_http_date_and_never_returns_a_negative_wait() {
        // Well in the past: the answer is "now", not a wait that would underflow.
        assert_eq!(parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT"), Some(0));
    }

    #[test]
    fn ignores_an_absent_or_unparseable_retry_after() {
        assert_eq!(parse_retry_after(""), None);
        assert_eq!(parse_retry_after("soon"), None);
    }
}
