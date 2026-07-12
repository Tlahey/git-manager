# Spec 17 — Notification System: Extensibility Audit & Background Delivery

> **Status**: Both parts implemented (2026-07-03). Part A (registry) and Part B (tray +
> hide-on-close) shipped together — see "Implementation status" at the bottom.

## Objective

Two independent questions were raised about the notification system (the PR/CI watcher +
bell-dropdown + native OS notification stack):

1. Is it built on a pattern that lets a new notification type be added without touching several
   unrelated files (the same question docs [15](15-rewards-system-refactor-plan.md) and
   [16](16-panels-interaction-refactor-plan.md) already asked of the rewards engine and the
   panels/tabs system)?
2. Is there a "worker" that can still deliver a notification when the user isn't actively looking
   at the app — i.e. does anything survive the app window being closed/hidden/unfocused?

Same rules as docs 13/15/16: **R1** (one file, one role), **R2** (operations through a
service/API layer — not revisited here, no IPC surface changes), **R3** (introduce a pattern only
where it closes a real, evidenced duplication — no speculative infrastructure).

**Scope**: frontend notification pipeline (`apps/desktop/src/{stores,hooks,components/notification}`)
for question 1; Tauri window/tray lifecycle (`apps/desktop/src-tauri/src/lib.rs`,
`Cargo.toml`) for question 2. No change to the GitHub-polling data source itself
(`useGitHubData.ts`) — see "Explicitly rejected" for why.

---

## Current state (audit)

### Part A — Extensibility: ad-hoc type-string branching, no registry

Read in full: `stores/notification.store.ts`, `hooks/useNotificationWatcher.ts`,
`components/notification/{utils.tsx,NotificationDropdown.tsx,NotificationSection.tsx}`.

There are 7 notification kinds (`AppNotification['type']`:
`new_pr | pr_merged | pr_closed | review_requested | review_status_changed | ci_success |
ci_failed`), each handled by its own hand-written branch, duplicated across **4 files**:

| File                                                                                                                                    | What it branches on `type` for                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`useNotificationWatcher.ts:142-312`](../../apps/desktop/src/hooks/useNotificationWatcher.ts#L142-L312)                                 | Detecting _whether_ this type fired (diffing `pr` against `previousPRs`) and building the `AppNotification` payload — 7 near-identical `if` blocks, ~15-20 lines each |
| [`useNotificationWatcher.ts:16-75`](../../apps/desktop/src/hooks/useNotificationWatcher.ts#L16-L75) (`showNativeNotification`)          | The emoji prefix shown in the OS notification (`'🟢 [CI Success] '`, etc.) — a second `switch (notif.type)`                                                           |
| [`components/notification/utils.tsx:13-92`](../../apps/desktop/src/components/notification/utils.tsx#L13-L92) (`getNotificationText`)   | i18n title/message lookup — a third `switch (notif.type)`                                                                                                             |
| [`components/notification/utils.tsx:95-114`](../../apps/desktop/src/components/notification/utils.tsx#L95-L114) (`getNotificationIcon`) | Icon component — a fourth `switch (notif.type)`                                                                                                                       |

Concrete cost of adding an 8th type: 4 files, 4 new branches, no compiler check tying them
together (nothing stops a type being added to the union in `notification.store.ts` without a
matching branch anywhere else — it would silently fall through to each `default:` case).

This is the same OCP/DRY shape docs 15 (`ruleRegistry.ts`) and 16 (`tabRegistry.ts`) already
closed elsewhere in this codebase — just not yet applied here.

**Two sub-findings that make a straight 1:1 port of `ruleRegistry.ts` unnecessary in one place**:
i18n keys already follow the convention `notifications.types.<type>` / `notifications.messages.<type>`
1:1 with the `type` string (confirmed by reading
[`packages/i18n/locales/en/common.json:37-52`](../../packages/i18n/locales/en/common.json#L37-L52)).
`getNotificationText` doesn't need a registry — it needs to stop hand-branching and just
template the key off `notif.type`, passing every possible interpolation field (i18next ignores
unused ones). Confirmed no unusual/type-specific title logic beyond the existing
`review_status_changed` special case (needs a pre-translated `status` string).

**Dead settings found while reading `NotificationSection.tsx`/`settings.store.ts`** (documented in
README's "Not yet wired up" list already, no action here — flagged so this plan doesn't
accidentally re-discover them as a false-new finding): `notifyOnFetch`, `notifyOnPull`,
`notifyOnPush` are stored/toggleable but never read by the watcher.

### Part B — Background delivery: no worker, no tray, window close = process exit

Read: `src-tauri/src/lib.rs`, `Cargo.toml`, `tauri.conf.json`. Grepped for `tokio::spawn`,
`TrayIcon`, `CloseRequested`, `on_window_event` — zero hits anywhere in `src-tauri/src`.

- `tauri-plugin-notification` is registered ([`lib.rs:42`](../../apps/desktop/src-tauri/src/lib.rs#L42))
  and used correctly from the JS side (`hooks/useNotificationWatcher.ts`'s `sendNotification(...)`)
  — OS notifications already fire correctly whenever the app process is running, including when
  the window is minimized or on another desktop/space (confirmed: `useGitHubData.ts`'s SWR poll
  has `revalidateOnFocus: false` and isn't gated on the window being focused or visible).
- The actual gap: **there is no tray icon, and no window-close interception.** `tauri.conf.json`
  defines one plain window with no lifecycle customization; closing it (⌘W / the red traffic
  light) terminates the whole process by Tauri's default behavior, killing the SWR polling loop
  and the notification watcher with it. "The user isn't currently on the app" today means either
  (a) window unfocused/minimized — notifications already work — or (b) window closed — nothing
  works, because nothing survives.
- No Rust-side polling exists at all: GitHub API calls happen directly from the renderer
  (`api/github.api.ts`, plain `fetch`), with the PAT token read out of `useSettingsStore` (JS,
  persisted via `tauri-plugin-store`). Moving this to a genuine Rust `tokio::spawn` background
  task was considered and **explicitly rejected for this plan** — see below.

---

## SOLID violations identified

| #   | Principle   | Violation                                                                                                                                                                                                     | Location                                                               | Concrete impact                                                                                                                                  |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **OCP/DRY** | Adding a notification type means editing 4 independent `switch`/`if` chains with no shared source of truth.                                                                                                   | `useNotificationWatcher.ts` (×2 switch/branch sites), `utils.tsx` (×2) | 4 files touched per new type; nothing enforces the union type and the 4 branch sites stay in sync.                                               |
| 2   | **SRP**     | Window-close has exactly one hardcoded behavior (full process exit) baked into Tauri's default — the app has no lifecycle policy of its own for "user closed the window but background work should continue." | `src-tauri/src/lib.rs` (absence of `on_window_event`)                  | Any feature that depends on the process staying alive after the window closes (this one, but also e.g. a future auto-fetch) silently can't work. |

---

## Target architecture

### Pattern 1 — `lib/notifications/notificationRegistry.ts`: one array as the source of truth

**Problem solved**: Part A. Modeled directly on `lib/rewards/ruleRegistry.ts`'s proven shape (a
typed table + one read function, no runtime registration):

```ts
export interface NotificationTypeDef {
  type: AppNotification['type']
  settingsKey: keyof NotificationSettings | null // null = no dedicated toggle, follows `enabled` only
  targetTab: AppNotification['targetTab'] | ((pr: PRLike) => AppNotification['targetTab'])
  nativePrefix: string // e.g. '🟢 [CI Success] '
  icon: ComponentType
  detect: (pr: PRLike, prev: PreviousPRSnapshot | undefined) => boolean
  reviewStatus?: (pr: PRLike) => ReviewStatus | undefined
}

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  /* 7 entries, one per type */
]
```

`useNotificationWatcher`'s big `if/else` block becomes one loop: for each `pr`, for each `def` in
`NOTIFICATION_TYPES`, if `def.detect(pr, prev)` and the setting resolves to enabled, build and
dispatch the notification generically (every type shares the same `repo/prNumber/prTitle/prId/
author/url` shape — only `targetTab` and `reviewStatus` vary, both already data, not code, in the
def). `showNativeNotification`'s prefix switch and `getNotificationIcon` both become a single
`NOTIFICATION_TYPES.find(d => d.type === notif.type)` lookup. `getNotificationText` does **not**
move into the registry (see Part A audit) — it's simplified in place to template the already-1:1
i18n key convention instead of branching.

Adding an 8th type becomes: one new object literal in the array, one new i18n key pair. No other
file changes.

**Deliberately not built**: no runtime/plugin registration, no per-type class hierarchy (a plain
data table is enough — these are inert descriptors, not behavior with internal state, unlike the
rewards engine's `RewardRule` classes which needed real polymorphic `matches`/`track` methods).
Building a `RewardRule`-style class-per-type here would be over-engineering for what is, on
inspection, pure data (same R3 restraint as doc 16's rejected `DialogManager`).

### Pattern 2 — Tray icon + hide-on-close

**Problem solved**: Part B, exactly the recommended-and-approved scope (see "Explicitly rejected"
for the larger option that was considered and turned down).

**Target**:

- `Cargo.toml`: add the `tray-icon` feature to the `tauri` dependency (already available in the
  pinned `tauri = 2.11.3`, confirmed via the vendored crate source — no new external dependency).
- `lib.rs`: in `.setup(|app| {...})`, build a `TrayIconBuilder` with a 2-item menu ("Show
  git-manager" / "Quit") using `tauri::menu::{Menu, MenuItem}`, reusing the existing app icon
  (`icons/icon.png`, already bundled). `on_menu_event` shows+focuses the main window or calls
  `app_handle.exit(0)`. Left-click on the tray icon also shows+focuses the window (the common
  platform convention).
- `tauri::Builder::default().on_window_event(...)`: intercept `WindowEvent::CloseRequested`,
  `api.prevent_default()`, `window.hide()` instead of letting the close proceed. The webview and
  its JS execution context are **not** destroyed by `hide()` — this is the mechanism that makes the
  fix work: the already-running SWR poll (60s interval, `App.tsx`-mounted `useNotificationWatcher`)
  keeps executing in the hidden window and OS notifications keep firing exactly as they do today
  when minimized, for as long as the process is alive (tray icon present).
- "Quit" in the tray menu is the only way to actually terminate the process now that the window's
  own close button no longer does — this needs to be discoverable, hence it's the second (not
  buried) menu item.

No change to `useNotificationWatcher.ts`'s polling mechanism itself — it already doesn't depend on
focus or visibility, only on the webview being alive, which is exactly what this pattern
guarantees for longer.

### Explicitly rejected (R3 discipline)

- **No Rust-side (`tokio::spawn`) GitHub-polling worker, and no migration of the PAT token into
  Rust-managed storage for this plan.** Considered as the "full" version of Part B — notifications
  would then survive even after the app is fully quit and relaunched cold, not just
  hidden-while-running. Rejected for now: it would (a) require moving today's JS-only PAT token
  storage (`useSettingsStore`, `tauri-plugin-store`) to a Rust-side secure store, which is a
  security-relevant change in its own right and arguably should close the existing
  `CLAUDE.md` convention gap ("SSH keys and HTTPS tokens are handled only in Rust") rather than be
  a side effect of a notification-pattern cleanup, and (b) require duplicating the PR/CI
  enrichment logic currently in `useGitHubData.ts` (multi-call GitHub REST aggregation, check-run
  status resolution) into Rust via `reqwest`. Both are legitimate, separately-scoped follow-ups,
  not part of this plan — presented as an option and explicitly declined in favor of the
  tray+hide-on-close scope above, which closes the concrete "worker" gap (window-close = process
  death) without touching where the token lives or duplicating the enrichment pipeline.
- **No class-per-notification-type hierarchy** — see Pattern 1's "deliberately not built."
- **No change to `getNotificationText`'s home file or signature** — the fix is internal
  (templating instead of branching), not a relocation.
- **No macOS "accessory" activation policy / dock-icon hiding.** Out of scope — a UX preference,
  not part of either question asked; the window still exists in the Dock while hidden, which is
  the simpler, less surprising default to ship first.

---

## Phased migration plan

| #   | Action                                                                                                                                                                                           | File(s)                             | Depends on | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------- | ------ |
| 1.1 | Create `lib/notifications/notificationRegistry.ts` (`NotificationTypeDef`, `NOTIFICATION_TYPES`)                                                                                                 | new file                            | —          | ✅     |
| 1.2 | Refactor `useNotificationWatcher.ts`'s diff/dispatch loop to iterate `NOTIFICATION_TYPES` instead of 7 hand-written branches; `showNativeNotification`'s prefix switch becomes a registry lookup | `hooks/useNotificationWatcher.ts`   | 1.1        | ✅     |
| 1.3 | Simplify `getNotificationIcon` (registry lookup) and `getNotificationText` (template the 1:1 i18n key convention instead of branching)                                                           | `components/notification/utils.tsx` | 1.1        | ✅     |
| 2.1 | Add `tray-icon` feature to `tauri` dependency                                                                                                                                                    | `src-tauri/Cargo.toml`              | —          | ✅     |
| 2.2 | Build tray icon + 2-item menu (Show/Quit) in `.setup()`; intercept `WindowEvent::CloseRequested` to hide instead of exit                                                                         | `src-tauri/src/lib.rs`              | 2.1        | ✅     |

Both parts are independent of each other and can ship as separate PRs, per the project's existing
"one action = one reasonable PR" convention.

### Manual test notes (Tauri-only, cannot be verified in a browser per `CLAUDE.md`)

- 1.1-1.3: use the dev-mode notification simulator buttons in `NotificationDropdown.tsx` (Test
  Review/Merge/CI Green/CI Red) to confirm every type still produces the correct icon, title,
  message, and native OS notification text/prefix after the refactor.
- 2.1-2.2: `pnpm dev`, close the window (traffic light / ⌘W) and confirm: the app disappears from
  the Dock-visible-window list but the process keeps running (tray icon appears); clicking the
  tray icon or its "Show" item restores the window; simulate a PR change while the window is
  closed and confirm the OS notification still appears; confirm "Quit" from the tray menu fully
  terminates the process.

---

## Implementation status

All 5 actions implemented. `pnpm --filter @git-manager/desktop typecheck` and `cargo build`/
`cargo clippy --all-targets` (from `apps/desktop/src-tauri`) all pass; no new clippy warnings or
`cargo fmt` diffs introduced by this plan's code (verified by filtering `cargo fmt -- --check` output
to only the touched files — the repo's pre-existing, out-of-scope fmt non-compliance elsewhere is
unchanged).

**Part A** (`lib/notifications/notificationRegistry.ts` + its two consumers): straight
implementation of the sketch, no deviations. `getNotificationText` was simplified in place
(templating the i18n key convention) rather than moved into the registry, exactly as scoped.

**Part B** (tray + hide-on-close, `src-tauri/src/lib.rs`): implemented as scoped, with two API
details resolved by reading the vendored `tauri-2.11.3` source directly rather than assuming from
memory: the close-interception method is `CloseRequestApi::prevent_close()`, not
`prevent_default()` (there is no `prevent_default` on this type); and the tray-icon-click handler
uses `TrayIconEvent::Click` matched inside `on_tray_icon_event`, separate from `on_menu_event`
(which only fires for the Show/Quit menu items). Reused `app.default_window_icon()` for the tray
icon rather than loading a separate asset — no dedicated tray icon exists yet
(`icons/menu/*` are context-menu action icons, not app/tray icons); a monochrome "template" tray
icon for macOS is a cosmetic follow-up, not required for the mechanism to work.

**Manual/visual testing not done in this session** (Tauri-only app, cannot be verified from a
browser per `CLAUDE.md`). Per the "Manual test notes" above, before merging: run `pnpm dev` and
verify (a) all 4 dev-mode notification simulator buttons in `NotificationDropdown.tsx` still
produce the correct icon/title/message/native-notification text, (b) closing the window hides it
behind a tray icon instead of quitting, (c) the tray's "Show" item and left-click both restore the
window, (d) a simulated PR change while the window is closed still produces an OS notification,
and (e) "Quit" from the tray menu fully terminates the process.

## Journal

| Date       | Action(s)            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-03 | Creation of the plan | Audit performed by reading current source (`stores/notification.store.ts`, `hooks/useNotificationWatcher.ts`, `hooks/useGitHubData.ts`, `components/notification/*`, `src-tauri/src/lib.rs`, `Cargo.toml`, `tauri.conf.json`, `packages/i18n/locales/en/common.json`) plus a general-purpose research pass. Confirmed `tray-icon` Tauri feature availability against the vendored `tauri-2.11.3` crate source (pinned in `Cargo.lock`) before committing to Pattern 2. User explicitly chose the tray+hide-on-close scope over the full Rust-worker/token-migration option when asked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-07-03 | 1.1, 1.2, 1.3        | Created `lib/notifications/notificationRegistry.ts` (7 `NotificationTypeDef` entries — `detect`/`targetTab`/`nativePrefix`/`icon`/`settingsKey`, plus a `reviewStatus` field only `review_status_changed` needs). Refactored `useNotificationWatcher.ts`'s big if/else block into a nested loop (`prs` × `NOTIFICATION_TYPES`) calling `def.detect`/`resolveTargetTab`/`isNotificationTypeEnabled`; `showNativeNotification`'s prefix switch became a `getNotificationTypeDef` lookup. Simplified `utils.tsx`: `getNotificationIcon` is now a one-line registry lookup, `getNotificationText` templates `notifications.types.${type}`/`notifications.messages.${type}` instead of a 7-case switch (confirmed safe: i18next ignores unused interpolation args, and the key convention already matched `type` 1:1). Two type errors surfaced and fixed during typecheck: `PreviousPRSnapshot.ciStatus` needed to stay optional to match the store's existing inline type, and `needsMyReview` (optional on `MockPR`) needed an explicit `!!` coercion in the `review_requested` detector to avoid a `boolean \| undefined` inference leak. Verified: `pnpm --filter @git-manager/desktop typecheck` passes. |
| 2026-07-03 | 2.1, 2.2             | Added `tray-icon` feature to the `tauri` dependency. Added `setup_tray()` (2-item `Show`/`Quit` menu via `tauri::menu::{Menu, MenuItem}`, `TrayIconBuilder` with `on_menu_event` + `on_tray_icon_event` for left-click-to-show) called from `.setup()`, and a top-level `.on_window_event()` that intercepts `WindowEvent::CloseRequested` (`api.prevent_close()` + `window.hide()`) so the window hides instead of the process exiting. Verified against the vendored Tauri source before writing (see "Implementation status" for the two API details that differed from initial assumptions). Verified: `cargo build` and `cargo clippy --all-targets` both pass with zero new warnings in `lib.rs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
