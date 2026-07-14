import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Services } from '@wdio/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Built by `pnpm --filter @git-manager/desktop build:e2e` (debug build, e2e Cargo feature,
// e2e-only capability — see apps/desktop/src-tauri/Cargo.toml and tauri.e2e.conf.json). Never
// the same binary as a normal `pnpm dev`/`pnpm build` output. The repo root Cargo.toml defines
// the workspace, so cargo puts `target/` there rather than under src-tauri/.
const appBinaryPath = join(__dirname, '../../target/debug/git-manager')

if (!existsSync(appBinaryPath)) {
  throw new Error(
    `Tauri e2e binary not found at ${appBinaryPath}. Run "pnpm --filter @git-manager/desktop build:e2e" first.`
  )
}

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

export const config: WebdriverIO.Config = {
  runner: 'local',
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
  beforeScenario: function (world) {
    console.log(`[timing] ▶ scenario — ${world.pickle.name}`)
  },
  afterScenario: function (world, result) {
    const durationMs = result.duration ?? 0
    const status = result.passed ? 'ok' : 'FAILED'
    console.log(`[timing] ◀ scenario ${status} in ${durationMs}ms — ${world.pickle.name}`)
  },
  afterStep: function (step, _scenario, result) {
    const durationMs = result.duration ?? 0
    const flag = durationMs > 3000 ? ' [SLOW]' : ''
    const status = result.passed ? 'ok' : 'FAILED'
    console.log(`[timing]${flag} ${durationMs}ms ${status} — ${step.text}`)
  },
}
