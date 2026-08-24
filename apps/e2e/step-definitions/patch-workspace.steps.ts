import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')

const PATCH_MENU_TESTID: Record<string, string> = {
  Create: 'patch-menu-create',
  Apply: 'patch-menu-apply',
  Dependency: 'patch-menu-dependency',
}

// Same Radix dropdown/submenu quirk bisect.steps.ts already works around for this ToolsMenu:
// this WKWebView provider doesn't react to a plain `.click()` for opening the menu, only to a
// real pointerdown+pointerup sequence. Duplicated locally rather than shared, matching this
// suite's existing per-file convention (each file already redefines its own META etc.).
async function openDropdown(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`openDropdown: no element with data-testid="${id}"`)
    const opts = {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: 'mouse',
      isPrimary: true,
    }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', opts))
  }, testid)
}

async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

When(/^I open the tools menu$/, async () => {
  await $('[data-testid="toolbar-tools-button"]').waitForDisplayed({ timeout: 10000 })
  await openDropdown('toolbar-tools-button')
})

When(/^I click the Patch "(Create|Apply|Dependency)" menu item$/, async (mode: string) => {
  const subTrigger = $('[data-testid="tools-menu-patch"]')
  await subTrigger.waitForDisplayed({ timeout: 10000 })
  // A DropdownMenuSubTrigger (Patch is a submenu, unlike the plain items bisect.steps.ts drives)
  // opens on click, not on the same pointerdown/pointerup dance the top-level trigger needs.
  await clickViaJs('tools-menu-patch')

  const testId = PATCH_MENU_TESTID[mode]
  const item = $(`[data-testid="${testId}"]`)
  await item.waitForDisplayed({ timeout: 10000 })
  await clickViaJs(testId)

  await $('[data-testid="patch-panel-title"]').waitForDisplayed({ timeout: 10000 })
})

// ── Create ───────────────────────────────────────────────────────────────

When(/^I stage all files in the patch workspace$/, async () => {
  await $('[data-testid="patch-zone-stage-all"]').click()
})

When(/^I click the patch create confirm button$/, async () => {
  await $('[data-testid="patch-create-confirm"]').click()
})

// Both Create and Apply call `close()` on success (after their own async backend call
// resolves), so waiting for the panel to disappear is the fixture-agnostic "the operation
// actually finished" signal — checking the resulting file/content right after the confirm click
// races the still-in-flight IPC call otherwise.
Then(/^the patch workspace closes$/, async () => {
  await $('[data-testid="patch-panel-title"]').waitForExist({ reverse: true, timeout: 10000 })
})

Then(/^a real patch file exists at "([^"]*)"$/, (path: string) => {
  expect(existsSync(path)).toBe(true)
  expect(readFileSync(path, 'utf8')).toContain('diff --git')
})

// ── Apply ────────────────────────────────────────────────────────────────

When(/^I click the patch choose-file button$/, async () => {
  await $('[data-testid="patch-choose-file"]').click()
})

// Builds a real patch file by making a real change to a real fixture, diffing it, then reverting
// the working tree — the same "use a real disposable repo, not a mock" principle README.md
// already documents, applied to producing a patch instead of a repo state.
Given(
  /^a real patch file exists at "([^"]*)" for "([^"]*)"$/,
  (patchPath: string, fixtureName: string) => {
    execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
    const repoPath = join(FIXTURE_ROOT, fixtureName)
    execFileSync('bash', ['-c', "printf 'line 3\\n' >> app.txt"], { cwd: repoPath })
    execFileSync('git', ['-C', repoPath, 'diff', '--output', patchPath])
    execFileSync('git', ['-C', repoPath, 'checkout', '--', 'app.txt'])
  }
)

Then(/^the patch apply confirm button is enabled$/, async () => {
  await $('[data-testid="patch-apply-confirm"]').waitForEnabled({ timeout: 10000 })
})

When(/^I click the patch apply confirm button$/, async () => {
  await $('[data-testid="patch-apply-confirm"]').click()
})

Then(
  /^the working tree file "([^"]*)" contains the line "([^"]*)"$/,
  (filePath: string, line: string) => {
    const content = readFileSync(join(getActiveRepoPath(), filePath), 'utf8')
    expect(content.split('\n')).toContain(line)
  }
)

// ── Dependency ───────────────────────────────────────────────────────────

// `prepareDependencyPatch` (services/dependency_patch.rs) diffs the live `node_modules/<name>`
// copy against a pristine one `pnpm patch` materialises fresh — so the panel only has something
// to show once the installed copy actually differs from what pnpm installed, exactly like a real
// user who edited a dependency in place. `pnpm-dependency` installs `left-pad@1.3.0` for real (see
// that fixture script's own comment on why this one isn't offline).
Given(/^the installed "([^"]*)" dependency has an uncommitted edit$/, async (name: string) => {
  const file = join(getActiveRepoPath(), 'node_modules', name, 'index.js')
  appendFileSync(file, '\n// e2e-patched\n')
})

When(/^I select the "([^"]*)" dependency to patch$/, async (name: string) => {
  const testId = `patch-dep-${name}`
  await $(`[data-testid="${testId}"]`).waitForDisplayed({ timeout: 10000 })
  await clickViaJs(testId)
})

// `selectDep` shells out to the real `pnpm patch` (materialising a pristine copy from pnpm's
// store) before the diff — and thus this button — is ready, so this needs pnpm's own latency
// budget, not the suite's usual 10s.
Then(/^the dependency patch confirm button is enabled$/, async () => {
  await $('[data-testid="patch-dep-confirm"]').waitForEnabled({ timeout: 20000 })
})

When(/^I click the dependency patch confirm button$/, async () => {
  await clickViaJs('patch-dep-confirm')
})

Then(
  /^a real dependency patch file exists for "([^"]*)@([^"]*)"$/,
  (name: string, version: string) => {
    const repoPath = getActiveRepoPath()
    expect(existsSync(join(repoPath, 'patches', `${name}@${version}.patch`))).toBe(true)
    const workspaceYaml = readFileSync(join(repoPath, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspaceYaml).toContain('patchedDependencies')
    expect(workspaceYaml).toContain(`${name}@${version}`)
  }
)
