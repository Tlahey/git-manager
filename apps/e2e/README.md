# @git-manager/e2e — WebdriverIO + Tauri

Real end-to-end tests that launch the actual compiled `git-manager` window (WKWebView on
macOS) and drive it over WebdriverIO's `embedded` provider — a WebDriver server that
`tauri-plugin-wdio-webdriver` runs inside the app itself, so no external driver is needed
(macOS has no native WebDriver for WKWebView, unlike Windows/Linux).

This is its own workspace package (`apps/e2e`), separate from `apps/desktop`, so its tests
never get picked up by `apps/desktop`'s Vitest run and so the app package's own
`package.json`/`node_modules` don't carry test-runner tooling that isn't part of the app.

## Structure — Gherkin/Cucumber

Tests are written in **Gherkin** (`@wdio/cucumber-framework`), in English, organised by feature:

```
features/                       # .feature files — the scenarios in plain Gherkin
  app-launch.feature            #   @smoke
  command-mocking.feature       #   @mocking
  fixup-autosquash.feature      #   @fixup  (+ @visual on the snapshot scenario)
step-definitions/               # the TypeScript backing each Given/When/Then, matched by text
  common.steps.ts               #   app launch / generic
  mocking.steps.ts              #   browser.tauri.mock scenarios
  fixup.steps.ts                #   fixture build + open, banner, autosquash preview, snapshot
```

Steps are matched to definitions by their text (regex) across all files, so a step phrased the
same way is reused everywhere. WDIO runs one worker per `.feature` file. `strict: true` in
`cucumberOpts` (see `wdio.conf.ts`) fails the run on any step with no matching definition rather
than silently skipping it.

### Tags

The `@smoke` / `@mocking` / `@fixup` / `@visual` annotations above `Feature:`/`Scenario:` are
**optional** Cucumber tags — metadata for categorising and filtering runs, not required headers
(`Feature:`/`Scenario:` are already the structural keywords). A feature-level tag applies to all
its scenarios; a scenario-level tag (like `@visual`) adds to it. Filter a run with a tag
expression — only the fast sanity checks, or everything except the pixel-comparison scenario:

```bash
pnpm --filter @git-manager/e2e exec wdio run ./wdio.conf.ts --cucumberOpts.tags='@smoke'
pnpm --filter @git-manager/e2e exec wdio run ./wdio.conf.ts --cucumberOpts.tags='not @visual'
```

Use `exec wdio run …` (not `test:e2e -- …`) — the `--` arg doesn't survive the pnpm-script
indirection, but the flag reaches `wdio` intact this way (verified). You can also just set
`tags` in `wdio.conf.ts`'s `cucumberOpts`. WDIO still spins up one worker per `.feature` file;
non-matching scenarios are reported as skipped.

## Running

```bash
pnpm build:e2e   # compiles a debug binary of @git-manager/desktop with the e2e feature
pnpm test:e2e    # launches it and runs features/**/*.feature
```

(equivalent to `pnpm --filter @git-manager/desktop build:e2e` and
`pnpm --filter @git-manager/e2e test:e2e`)

`build:e2e` must be rerun after any Rust or frontend change you want covered — `test:e2e`
just launches whatever binary is already on disk at `target/debug/git-manager`. Neither script
is wired into the turbo `build`/`test` pipeline (deliberately — it needs a real GUI to launch
the window, and shouldn't run on every routine `pnpm test`), so it's always an explicit,
separate step, same as `pnpm dev:import-repo`/`pnpm fixture:build`.

## Why this is behind a feature flag, not always-on

The embedded WebDriver server (`tauri-plugin-wdio-webdriver`) and the IPC mocking/execute
bridge (`tauri-plugin-wdio`, `@wdio/tauri-plugin`) are real attack surface — a local process
that can inspect and mock every Tauri IPC call. They must never ship to a real user:

- **Rust**: both plugins are optional deps gated behind the `e2e` Cargo feature
  (`src-tauri/Cargo.toml`), only registered in `lib.rs` under `#[cfg(feature = "e2e")]`.
  A plain `cargo build`/`pnpm build` never compiles them in.
- **Capability/permissions**: the `wdio:default` / `wdio-webdriver:default` permissions are
  declared *inline* inside `src-tauri/tauri.e2e.conf.json` (merged only via `--config` on
  `build:e2e`), not as a file in `src-tauri/capabilities/` — Tauri's build-time ACL validator
  scans every file in that directory regardless of the `security.capabilities` allowlist, so a
  real `capabilities/e2e.json` file would fail every normal build the moment the `e2e` feature
  is off (permission references a plugin that isn't compiled in). Keeping it inline sidesteps
  that entirely.
- **Frontend**: `@wdio/tauri-plugin` (auto-initializes on import, must load before tests run)
  is imported in `src/main.tsx` behind `import.meta.env.VITE_E2E === 'true'`, a build-time
  constant — Vite/Rollup dead-code-eliminates the whole branch (and the plugin's ~40KB) out of
  every normal build. Verified: `grep -rl wdio dist/assets/*.js` on a plain `vite build` finds
  nothing; it's only present when built via `vite build --mode e2e` (which reads `.env.e2e`).

## Mocking real Tauri commands

`browser.tauri.mock('command_name')` gives you a vitest/jest-style mock (`mockReturnValue`,
`mockResolvedValue`, `mockRejectedValue`, `.mock.calls`, `restoreAllMocks()`, …) for a real Tauri
command. See `features/command-mocking.feature` + `step-definitions/mocking.steps.ts`, which mock
`check_ollama_status` to test both a faked success and a faked rejection, then prove the mock
actually gets torn down and the real backend call resumes.

**Important limitation, found while building this**: the mock only reaches commands invoked
through `browser.tauri.execute(({ core }) => core.invoke(...))` — the bridge WDIO injects for
test code. It does **not** intercept `invoke()` calls made by the app's own bundled code (e.g. a
real button's `onClick`, like `DashboardPage.tsx`'s "Browse" button calling
`@tauri-apps/plugin-dialog`'s `open()`). That would require patching `window.__TAURI__.core.invoke`
itself, which is what `@wdio/tauri-plugin` tries to do on init — but on this Tauri/webview build
that property isn't configurable, so `Object.defineProperty` throws, is silently caught, and
`core._wdioInvokeInterceptor` never gets set (confirmed by inspecting it directly via
`browser.execute`). So: use `browser.tauri.mock` + `browser.tauri.execute` to exercise a
command's own contract/edge cases from the test side (`command-mocking.feature`); for driving UI
state that would normally come from a real user interaction with a native surface (the OS folder
picker, in the fixup feature's case), seed the app's own `zustand/persist` `localStorage` key and
reload instead — see below.

Don't reach for mocking to fake git behaviour itself — use a real disposable repo from
`tools/git-fixtures/` instead (see the fixup feature). A mocked git backend can hide real libgit2
bugs; mocking is for the edges around git (dialogs, network, OS), not git itself.

## Driving UI state without a real native dialog

`features/fixup-autosquash.feature`'s `Given the "…" fixture repository is built and opened` step
needs the app to have a repo open, which normally happens by clicking "Browse" → native OS folder
picker → `open_repo`. WebDriver can't drive a native dialog, and (per the limitation above)
mocking the dialog's `invoke()` call doesn't work here either. Instead the step
(`step-definitions/fixup.steps.ts`) writes directly to the same `localStorage` key
`repoUI.store.ts`'s `zustand/persist` middleware owns (`git-manager-repos-ui`, shape `{ state: {
openTabs, activeRepo, activeTab }, version: 0 }`) and reloads the page. From that point on,
everything is real: `RepoView`'s own mount effect calls the real `open_repo`,
`PendingFixupsBanner` fires a real `get_pending_fixups`, `AutosquashPreviewDialog` a real
`autosquash_preview` — all against the real fixup-chain fixture repo. Only the "click Browse, use
the native picker" step is skipped.

## Visual snapshots

`@wdio/visual-service` compares a screenshot of an element (or the full page) against a
checked-in baseline and returns a mismatch percentage. First run with no baseline present
writes one (`autoSaveBaseline: !process.env.CI` in `wdio.conf.ts`); every run after that
compares against it and fails if the diff exceeds the tolerance passed to
`toMatchElementSnapshot`.

```ts
await expect($('[data-testid="autosquash-preview-groups"]')).toMatchElementSnapshot('autosquash-preview-groups', 1)
```

A tolerance of exactly `0` is too strict in practice — two renders of the identical state can
differ by a fraction of a percent from font hinting/antialiasing jitter alone (measured ~0.27%
here before adding the stabilisation step below); `1` absorbs that noise while still catching
real UI regressions, which run an order of magnitude higher. The snapshot step in
`step-definitions/fixup.steps.ts` also waits for `document.fonts.ready` and force-disables CSS
transitions/animations right before capturing, both recommended by the upstream visual-testing
guide, to cut noise further.

Baselines live in `apps/e2e/__visual__/<platform>/<arch>/<driverProvider>/baseline/` — gitignored
here since there's no CI runner yet to own a canonical baseline per-OS; once there is, drop the
`apps/e2e/__visual__/` line from `.gitignore` and commit baselines so PRs get an explicit visual
diff. Only captures webview content, not native OS chrome (title bar, menus, dialogs) — those
aren't part of the WebDriver screenshot regardless of provider.

## Known upstream bug worked around here

`@wdio/tauri-service@1.2.0` declares `@wdio/native-utils@2.4.0` as a dependency, but its
compiled code imports `installMockSyncOverride`, which only exists starting in
`@wdio/native-utils@2.5.0` — a version-skew bug in how that package was published
(webdriverio/desktop-mobile). Worked around with a `pnpm.overrides` entry pinning
`@wdio/native-utils` to `^2.5.0` in the root `package.json`. Safe to remove once upstream
re-publishes `@wdio/tauri-service` with the correct dependency range.

## Side effect to know about

Running `build:e2e` regenerates `src-tauri/gen/schemas/*.json` to include the wdio
permissions (since the `e2e` feature is active for that build). These are IDE-autocomplete
schema files only — not shipped in any binary — but if you want a clean diff before
committing, `git checkout apps/desktop/src-tauri/gen/schemas/` after running a normal
`cargo check`/`pnpm dev` restores them.
