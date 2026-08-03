import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Services } from '@wdio/types'
import { startFakeAiServer, SUITE_WIDE_FAKE_AI_PORT, type FakeAiServerHandle } from './support/fakeAiServer.ts'
import { useIsolatedHome, isolatedAppBinary } from './support/isolatedAppState.js'
import {
  resetRunReport,
  startSession,
  endSession,
  startScenario,
  recordStep,
  endScenario,
  writeRunReport,
} from './support/runReport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Built by `pnpm --filter @git-manager/desktop build:e2e` (debug build, e2e Cargo feature,
// e2e-only capability — see apps/desktop/src-tauri/Cargo.toml and tauri.e2e.conf.json). Never
// the same binary as a normal `pnpm dev`/`pnpm build` output. The repo root Cargo.toml defines
// the workspace, so cargo puts `target/` there rather than under src-tauri/.
const builtBinaryPath = join(__dirname, '../../target/debug/git-manager')

if (!existsSync(builtBinaryPath)) {
  throw new Error(
    `Tauri e2e binary not found at ${builtBinaryPath}. Run "pnpm --filter @git-manager/desktop build:e2e" first.`
  )
}

// Run a differently-named copy: that is what keeps the suite out of the developer's real
// localStorage (theme, saved repos, rewards). See support/isolatedAppState.ts.
const appBinaryPath = isolatedAppBinary(builtBinaryPath)

const driverProvider = 'embedded'

// Per-OS + per-arch + per-provider baselines — font rendering/anti-aliasing differ across
// platforms, and Tauri's driver providers capture different content (embedded: webview only).
// See apps/e2e/README.md.
const visualService: Services.ServiceEntry = [
  'visual',
  {
    baselineFolder: join(
      __dirname,
      '__visual__',
      process.platform,
      process.arch,
      driverProvider,
      'baseline'
    ),
    screenshotPath: join(
      __dirname,
      '__visual__',
      process.platform,
      process.arch,
      driverProvider,
      'actual'
    ),
    formatImageName: '{tag}-{width}x{height}',
    autoSaveBaseline: !process.env.CI,
  },
]

// Started once for the whole run (this hook runs in the launcher process, not a per-spec-file
// worker — see SUITE_WIDE_FAKE_AI_PORT's own doc comment for why a fixed port is what lets the
// workers reach it). Every scenario's Before hook (hooks.steps.ts) points the default AI settings
// here, so the real factory default (AI enabled, pointed at a local Ollama) doesn't raise an
// "AI provider is unreachable" banner in a sandbox with no Ollama running — scenarios that need
// their own scripted responses (ai-generation.feature, daily-summary.feature) still start their
// own per-scenario fake server on an ephemeral port, same as before.
let suiteWideAiServer: FakeAiServerHandle | undefined

export const config: WebdriverIO.Config = {
  runner: 'local',
  onPrepare: async function () {
    // Before anything can touch the app's storage: own $HOME for the Rust-side state (activity log,
    // AI logs, summaries, user themes). Pairs with the renamed binary above, which covers
    // localStorage. See support/isolatedAppState.ts.
    useIsolatedHome()
    // Drop the previous run's per-scenario timings; workers append to it as they go.
    resetRunReport()
    suiteWideAiServer = await startFakeAiServer({ port: SUITE_WIDE_FAKE_AI_PORT })
  },
  onComplete: async function () {
    await suiteWideAiServer?.stop()
    // Aggregates what the workers recorded into REPORT.md and prints the headline. See
    // support/runReport.ts for why it times scenarios itself instead of trusting result.duration.
    writeRunReport()
  },
  // Gherkin features; one worker per .feature file (like spec files were). Step definitions
  // live in ./step-definitions and are matched by text regardless of feature.
  specs: ['./features/**/*.feature'],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'tauri',
      'wdio:enforceWebDriverClassic': true,
      'tauri:options': {
        application: appBinaryPath,
      },
      'wdio:tauriServiceOptions': {
        appBinaryPath,
        driverProvider,
        captureBackendLogs: true,
        captureFrontendLogs: true,
      },
    } as WebdriverIO.Capabilities,
  ],
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [['@wdio/tauri-service', { driverProvider }], visualService],
  framework: 'cucumber',
  reporters: ['spec'],
  cucumberOpts: {
    require: ['./step-definitions/**/*.ts'],
    backtrace: false,
    requireModule: [],
    dryRun: false,
    failFast: false,
    snippets: true,
    source: true,
    // Undefined or pending steps fail the run — catches a scenario referencing a step with no
    // matching definition, rather than silently skipping it.
    strict: true,
    // Empty = run everything. Override per-run to filter by tag, e.g.
    //   pnpm --filter @git-manager/e2e test:e2e -- --cucumberOpts.tags='@smoke'
    tags: '',
    timeout: 60000,
    ignoreUndefinedDefinitions: false,
  },
  outputDir: join(__dirname, 'logs'),
  // Diagnostic only: prints how long each step actually took, using cucumber's own step timer
  // (not a hand-rolled one) — helpful for telling apart "the app is genuinely slow here" from "this
  // step's waitFor just burned its whole timeout because the element never showed up". A worker's
  // own spec-reporter output is already prefixed with its instance id, so these lines stay
  // attributable even with several .feature files queued (maxInstances: 1 above still runs them
  // one at a time, never concurrently).
  //
  // afterStep alone doesn't cover time spent in cucumber's own Before/After scenario hooks (fixture
  // rebuilds, mock resets, etc. declared with Before()/After() across step-definitions/*.ts) — that
  // shows up as a gap between one scenario's last [timing] step line and the next scenario's first.
  // beforeScenario/afterScenario below report the *whole* scenario's duration so that gap is
  // visible directly: (scenario duration) − (sum of its steps' durations) = hook-only overhead.
  beforeSession: function () {
    startSession()
  },
  // Runs once the session is up, so the delta is exactly what launching the app and connecting the
  // driver cost this worker — kept out of the first scenario's time, where it used to hide.
  before: async function (_caps, specs) {
    endSession(specs)
    // The W3C default script timeout is 30s, and it is the price of any `browser.execute` that
    // lands in a document a navigation is tearing down: the script vanishes with the page, and
    // the driver waits the whole window before erroring ("Script execution timed out") — which
    // is how even the stamped settle-poll in support/navigation.ts could still absorb a silent
    // 30s on its first attempt. Every execute in this suite is a sub-second DOM/localStorage
    // read; 5s caps the cost of losing one to a swap at 5s, and the caller's retry then lands
    // on the committed document.
    await browser.setTimeout({ script: 5000 })
  },
  beforeScenario: function (world) {
    startScenario()
    console.log(`[timing] ▶ scenario — ${world.pickle.name}`)
  },
  afterScenario: function (world, result) {
    const durationMs = result.duration ?? 0
    const status = result.passed ? 'ok' : 'FAILED'
    endScenario(world.pickle.uri ?? '', world.pickle.name, result.passed)
    console.log(`[timing] ◀ scenario ${status} in ${durationMs}ms — ${world.pickle.name}`)
  },
  afterStep: function (step, _scenario, result) {
    const durationMs = result.duration ?? 0
    recordStep(durationMs)
    const flag = durationMs > 3000 ? ' [SLOW]' : ''
    const status = result.passed ? 'ok' : 'FAILED'
    console.log(`[timing]${flag} ${durationMs}ms ${status} — ${step.text}`)
  },
}
