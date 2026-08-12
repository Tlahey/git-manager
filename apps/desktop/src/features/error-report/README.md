# `features/error-report`

Turning a failure the user hit into an issue on **this app's** GitHub tracker — reviewed and
submitted by them, from their own account, with the machine-identifying parts stripped out first.

## The three rules this feature exists to keep

**1. Nothing leaves the machine without a person clicking.** There is no background reporting, no
"send diagnostics" setting, no retry queue. The app is local-only by design (CLAUDE.md: _no
telemetry, no cloud calls_), and an automatic error upload is telemetry whatever it is called. A
report is a thing a user reads and submits.

**2. The app posts as the user, or not at all.** `apiCreateErrorIssue` passes the **id** of the
active GitHub account — a login, not a secret; Rust looks the token up in the OS keychain and
attaches it, so nothing here ever holds a credential. It is the same account the device flow
already grants `repo` scope to. Without one, the dialog degrades to a finished, redacted body with
a copy button and a link to the tracker: filing on the user's behalf would need a bot token and a
server to hold it, which is rule 1 broken by another route.

**3. A tracker nobody reads helps nobody.** Two mechanisms defend that, and both are load-bearing:
`lib/reportability.config.ts` refuses to treat a protected branch or a failing pre-commit hook as a
defect, and `lib/fingerprint.ts` + `apiFindReportedIssue` land the tenth reporter of a bug on the
existing issue instead of the tenth copy of it.

## What each folder holds

| Path                          | What's in it                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `index.ts`                    | The public surface — five names, one per kind of caller. Read its comment before widening it.               |
| `api/errorReport.api.ts`      | The duplicate search and the two ways to submit. Composes `api/github/`; targets `lib/projectRepo.ts`.      |
| `lib/publicRedact.ts`         | The **second** redaction pass — the one calibrated for publishing, not for a local log.                     |
| `lib/reportability.config.ts` | `AppError` code → `bug` / `unclear` / `expected`, with the reason shown to the reporter.                    |
| `lib/fingerprint.ts`          | The stable id that makes duplicate detection possible.                                                      |
| `lib/buildReport.ts`          | Pure assembly of the exact markdown that gets posted. Every guarantee above is asserted against its output. |
| `lib/draftFromActivity.ts`    | Activity-log line → draft, including recovering the error `code` from the raw payload the log kept.         |
| `lib/environment.ts`          | What the webview can honestly say about the host — and what it deliberately refuses to guess.               |
| `hooks/useErrorReport.ts`     | Rebuilds the report on every keystroke, runs the duplicate lookup, submits.                                 |
| `stores/errorReport.store.ts` | Which failure the dialog is showing; which ones this session already filed. Not persisted.                  |
| `components/`                 | The dialog, its verdict banner, its preview, and the host mounted at the app root.                          |

## Where it is wired in

- **[`App.tsx`](../../App.tsx)** mounts `ErrorReportHost` once, above every takeover.
- **[`Footer.tsx`](../../components/footer/Footer.tsx)** has the bug button, which is a shortcut to
  the Activity Logs **narrowed to failures** — not a one-click report. With no failure attached it
  would have to guess which error the user means, and the most recent one recorded is routinely not
  the one bothering them. Choosing the line is the difference between a useful report and a wrong
  one, and it costs one click.
- **[`ActivityLogDetail.tsx`](../../app/activity-logs/components/ActivityLogDetail.tsx)** puts a
  report button under any failed operation. This is the richest entry point: the log kept the whole
  correlated action, so the report says "the pull did these nine things and the eighth failed".
- **[`AppErrorBoundary.tsx`](../../components/app-error-boundary/AppErrorBoundary.tsx)** renders its
  **own** dialog instance on the crash screen. It has to: the host lives in the tree the boundary
  just replaced.

## What deliberately lives elsewhere, and what isn't here yet

- **The first redaction pass** is [`lib/debugLogRedact.ts`](../../lib/debugLogRedact.ts), app-level,
  because it protects the activity log whether or not anything is ever reported. `publicRedact` is
  strictly downstream of it and assumes it ran.
- **`publicRedact` is not exported from `index.ts`.** It is calibrated for this report's body; a
  second caller reaching for "the redaction helper" is how a rule written for one payload ends up
  quietly guarding another it never fit.
- **No toast entry point.** The app has ~90 `toast.error` call sites and adding a Report action to
  each is a change to ninety files for a button most of them shouldn't show (their errors classify
  as `expected`). The Activity Logs view already lists every failure, including the ones a toast
  showed. If a toast action is added later, it should read the same classification table and appear
  only for a `bug` verdict.
- **No Rust.** Nothing here needs the backend: the GitHub calls are `fetch` from the frontend like
  every other forge call in the app, and the activity log is already in the store.
