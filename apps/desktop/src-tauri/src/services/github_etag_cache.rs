//! The conditional-request cache that keeps the app's polling from spending its GitHub quota.
//!
//! # Why this exists at all
//!
//! Almost every GitHub call the app makes is a *poll*: the pull-request list refetches every minute,
//! a PR's details every thirty seconds, its mergeability every twenty. The overwhelming majority of
//! those answers are byte-for-byte what the previous one was, and each one costs a request against a
//! 5000/hour budget that a handful of open pull requests can exhaust on its own.
//!
//! GitHub's answer to this is `If-None-Match`: send back the `ETag` it gave you, and an unchanged
//! resource comes back as a bodyless `304 Not Modified` — **which does not count against the primary
//! rate limit**. That is the entire point of this module. The webview's own HTTP cache used to do
//! something vaguely like it before requests moved into Rust, and nothing replaced it.
//!
//! # What the caller sees
//!
//! Nothing. A 304 is turned back into the `200` and the body the caller would have received, so no
//! `api/github/*.api.ts` function had to learn a new status. `from_cache` on the response says which
//! it was, for the rate-limit store's benefit and for debugging; it is not a `Result` variant and no
//! caller has to branch on it.
//!
//! # Three things that must stay true
//!
//! * **The account id is part of the key.** Two connected accounts see different things at the same
//!   URL — a private repository is a 200 for one and a 404 for the other — so an entry stored under
//!   one token must never be replayed for another. The `Accept` header is in the key for the same
//!   reason: `…/contents/x` returns JSON metadata or the file's raw text depending on it.
//! * **Only `GET` is cached.** A `POST` that merges a pull request has no business being answered
//!   from memory, and GitHub does not send an `ETag` for one anyway.
//! * **The cache is bounded in bytes, not entries.** A cached entry is a whole response body, and the
//!   PR-diff viewer reads file contents through the same path — capping the *count* would let a few
//!   large files pin tens of megabytes. Eviction is least-recently-used, so the endpoints that are
//!   actually polled (the ones this exists for) stay resident while one-off reads age out.
//!
//! The cache is in memory only: it is an optimization whose worst case is spending one request, and
//! persisting response bodies to disk would be a place for private repository data to outlive the
//! session that fetched it.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// Total cached body bytes to keep. Roughly the working set of a busy session — the PR lists, the
/// open PR's details, and a handful of file reads — with room to spare, and small enough that the
/// whole thing is a rounding error next to the webview.
const MAX_TOTAL_BYTES: usize = 24 * 1024 * 1024;

/// Bodies larger than this are not cached at all. One of them would evict the entire polling working
/// set to buy a conditional request on something nobody polls.
const MAX_ENTRY_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Key {
    /// `None` for an anonymous request — a distinct identity, not a missing one.
    account_id: Option<String>,
    url: String,
    accept: String,
}

#[derive(Debug)]
struct Entry {
    etag: String,
    body: String,
    /// Tick of the last hit, for LRU eviction.
    used_at: u64,
}

#[derive(Debug, Default)]
struct EtagCache {
    entries: HashMap<Key, Entry>,
    total_bytes: usize,
    clock: u64,
}

impl EtagCache {
    fn touch(&mut self) -> u64 {
        self.clock += 1;
        self.clock
    }

    /// Drops least-recently-used entries until the cache fits again.
    fn evict_until_fits(&mut self) {
        while self.total_bytes > MAX_TOTAL_BYTES {
            let Some(victim) = self
                .entries
                .iter()
                .min_by_key(|(_, e)| e.used_at)
                .map(|(k, _)| k.clone())
            else {
                // Nothing left to evict: the accounting is the only thing that can be wrong here, so
                // reset it rather than spinning forever.
                self.total_bytes = 0;
                return;
            };
            if let Some(entry) = self.entries.remove(&victim) {
                self.total_bytes = self.total_bytes.saturating_sub(entry.body.len());
            }
        }
    }
}

fn cache() -> &'static Mutex<EtagCache> {
    static CACHE: OnceLock<Mutex<EtagCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(EtagCache::default()))
}

/// A poisoned lock here means a previous caller panicked while holding it, which cannot corrupt
/// anything a cache miss would not also handle — so the guard is taken back rather than propagated.
fn lock() -> std::sync::MutexGuard<'static, EtagCache> {
    cache().lock().unwrap_or_else(|e| e.into_inner())
}

fn key(account_id: Option<&str>, url: &str, accept: &str) -> Key {
    Key {
        account_id: account_id.filter(|id| !id.is_empty()).map(str::to_string),
        url: url.to_string(),
        accept: accept.to_string(),
    }
}

/// One cached response: the `ETag` to offer as `If-None-Match`, and the body a `304` will decline to
/// resend.
pub struct Cached {
    pub etag: String,
    pub body: String,
}

/// What this exact request was answered with last time, if anything.
///
/// Hands back the body *with* the etag, rather than letting the caller come back for it once the
/// `304` arrives. That would open a window — the entry can be evicted while the request is in
/// flight — in which a `304` would be answered with no body at all, which every caller would parse
/// as an empty result. Cloning a body per conditional GET is a memcpy set against a network round
/// trip; a silently empty pull-request list is not a trade worth making.
pub fn lookup(account_id: Option<&str>, url: &str, accept: &str) -> Option<Cached> {
    let mut cache = lock();
    let now = cache.touch();
    let entry = cache.entries.get_mut(&key(account_id, url, accept))?;
    entry.used_at = now;
    Some(Cached {
        etag: entry.etag.clone(),
        body: entry.body.clone(),
    })
}

/// Records a fresh response's `ETag` and body, replacing any earlier entry for the same request.
///
/// Called only for a successful `GET` that carried an `ETag`; everything else — a write, an error
/// status, a response GitHub chose not to tag — simply leaves the cache as it was.
pub fn store(account_id: Option<&str>, url: &str, accept: &str, etag: &str, body: &str) {
    if etag.is_empty() || body.len() > MAX_ENTRY_BYTES {
        return;
    }
    let mut cache = lock();
    let now = cache.touch();
    let k = key(account_id, url, accept);
    if let Some(previous) = cache.entries.remove(&k) {
        cache.total_bytes = cache.total_bytes.saturating_sub(previous.body.len());
    }
    cache.total_bytes += body.len();
    cache.entries.insert(
        k,
        Entry {
            etag: etag.to_string(),
            body: body.to_string(),
            used_at: now,
        },
    );
    cache.evict_until_fits();
}

/// Forgets everything cached for one account — called when it is disconnected.
///
/// Without this, reconnecting a *different* token under a login that was used before would inherit
/// the previous session's bodies, and the app would show one account data fetched as another.
pub fn forget_account(account_id: &str) {
    let mut cache = lock();
    let doomed: Vec<Key> = cache
        .entries
        .keys()
        .filter(|k| k.account_id.as_deref() == Some(account_id))
        .cloned()
        .collect();
    for k in doomed {
        if let Some(entry) = cache.entries.remove(&k) {
            cache.total_bytes = cache.total_bytes.saturating_sub(entry.body.len());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The cache is process-global, so every test works under a URL of its own rather than trying to
    /// clear it — `cargo test` runs these on several threads.
    fn url(name: &str) -> String {
        format!("https://api.github.com/test/{name}")
    }

    const ACCEPT: &str = "application/vnd.github.v3+json";

    fn etag_of(account_id: Option<&str>, url: &str, accept: &str) -> Option<String> {
        lookup(account_id, url, accept).map(|c| c.etag)
    }

    #[test]
    fn replays_the_body_stored_under_the_same_request() {
        let u = url("replays");
        store(Some("octocat"), &u, ACCEPT, "\"abc\"", "[1,2,3]");
        let hit = lookup(Some("octocat"), &u, ACCEPT).expect("a hit");
        assert_eq!(hit.etag, "\"abc\"");
        assert_eq!(hit.body, "[1,2,3]");
    }

    #[test]
    fn never_replays_one_accounts_body_for_another() {
        // The failure this guards: a private repository is a 200 for one token and a 404 for the
        // next, so an entry keyed only by URL would show one account the other's data.
        let u = url("per-account");
        store(Some("octocat"), &u, ACCEPT, "\"abc\"", "private");
        assert_eq!(etag_of(Some("hubot"), &u, ACCEPT), None);
        assert_eq!(etag_of(None, &u, ACCEPT), None);
    }

    #[test]
    fn keys_on_the_accept_header_too() {
        // `…/contents/x` is JSON metadata or the file's raw text depending on this alone.
        let u = url("accept");
        store(Some("octocat"), &u, ACCEPT, "\"abc\"", "{\"json\":true}");
        assert_eq!(
            etag_of(Some("octocat"), &u, "application/vnd.github.raw"),
            None
        );
    }

    #[test]
    fn a_second_response_replaces_the_first() {
        let u = url("replace");
        store(Some("octocat"), &u, ACCEPT, "\"v1\"", "old");
        store(Some("octocat"), &u, ACCEPT, "\"v2\"", "new");
        let hit = lookup(Some("octocat"), &u, ACCEPT).expect("a hit");
        assert_eq!(hit.etag, "\"v2\"");
        assert_eq!(hit.body, "new");
    }

    #[test]
    fn refuses_a_body_too_large_to_be_worth_caching() {
        let u = url("oversized");
        store(
            Some("octocat"),
            &u,
            ACCEPT,
            "\"big\"",
            &"x".repeat(MAX_ENTRY_BYTES + 1),
        );
        assert_eq!(etag_of(Some("octocat"), &u, ACCEPT), None);
    }

    #[test]
    fn disconnecting_an_account_forgets_its_bodies_and_nobody_elses() {
        let u = url("forget");
        store(Some("leaver"), &u, ACCEPT, "\"abc\"", "theirs");
        store(Some("stayer"), &u, ACCEPT, "\"abc\"", "ours");
        forget_account("leaver");
        assert_eq!(etag_of(Some("leaver"), &u, ACCEPT), None);
        assert_eq!(
            etag_of(Some("stayer"), &u, ACCEPT).as_deref(),
            Some("\"abc\"")
        );
    }

    #[test]
    fn evicts_least_recently_used_entries_to_stay_within_the_byte_budget() {
        // Its own cache instance: the eviction threshold is global state, and filling the shared one
        // would evict whatever the other tests just stored.
        let mut cache = EtagCache::default();
        let big = "x".repeat(MAX_TOTAL_BYTES / 2);
        for name in ["a", "b", "c"] {
            let now = cache.touch();
            cache.total_bytes += big.len();
            cache.entries.insert(
                Key {
                    account_id: Some("octocat".into()),
                    url: name.into(),
                    accept: ACCEPT.into(),
                },
                Entry {
                    etag: "\"e\"".into(),
                    body: big.clone(),
                    used_at: now,
                },
            );
            cache.evict_until_fits();
        }
        assert!(cache.total_bytes <= MAX_TOTAL_BYTES);
        // "a" was the oldest of the three, so it is the one that went.
        assert!(!cache.entries.keys().any(|k| k.url == "a"));
        assert!(cache.entries.keys().any(|k| k.url == "c"));
    }
}
