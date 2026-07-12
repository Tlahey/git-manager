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
}
