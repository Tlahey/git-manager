import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $ } from '@wdio/globals'
import { Given } from '@wdio/cucumber-framework'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')
const PERSIST_KEY = 'git-manager-repos-ui'

/**
 * Seeds the repo-UI persist key with `repoPath` as the only open tab, then forces the app back to
 * its base route.
 *
 * Navigating to `/?e2e=<now>` rather than calling reload(): the embedded provider shares one app
 * window across features, and a prior feature (e.g. the merge editor) may have left it on a
 * different route — reload() would preserve that stale URL, whereas forcing `/?…` always lands on
 * the main app, which then rehydrates from the seed.
 */
async function seedAndReload(repoPath: string) {
  const origin = await browser.execute(() => window.location.origin)

  await browser.execute(
    (key: string, value: string) => {
      localStorage.setItem(key, value)
    },
    PERSIST_KEY,
    JSON.stringify({
      state: { openTabs: [repoPath], activeRepo: repoPath, activeTab: repoPath },
      version: 0,
    })
  )

  // Navigate through WebDriver rather than assigning `window.location.href` inside the same
  // `execute`: the assignment tears the page down while the driver is still completing that call,
  // and the navigation can be lost — leaving the old repo on screen with the step none the wiser.
  await browser.url(`${origin}/?e2e=${Date.now()}`)

  // RepoView's root renders for any opened repo — a fixture-agnostic "repo view is loaded" signal,
  // unlike the fixup banner which only exists for the fixup-chain fixture.
  await $('[data-testid="repo-view"]').waitForDisplayed({ timeout: 15000 })
}

/** The repo the app actually rehydrated, read from the live store (falling back to the persisted
 * key when the debug hook isn't exposed). */
function openedRepo(): Promise<string | null> {
  return browser.execute((key: string) => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: { getState: () => { activeRepo: string | null } }
      }
    ).__e2eRepoUIStore
    if (store) return store.getState().activeRepo
    const raw = localStorage.getItem(key)
    return raw ? ((JSON.parse(raw).state.activeRepo as string) ?? null) : null
  }, PERSIST_KEY)
}

// Generic "open a fixture repo" step, reused across features. Opening a repo normally goes
// through a native OS folder picker (outside the webview, and not interceptable here — see
// README.md "Driving UI state without a real native dialog"). Instead we build the real,
// disposable fixture fresh, seed the same zustand/persist localStorage key the app writes to,
// then reload — from here on every render, query and IPC call is the real thing.
Given(/^the "([^"]*)" fixture repository is opened$/, async (fixtureName: string) => {
  execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
  const repoPath = join(FIXTURE_ROOT, fixtureName)

  // The seed races the app's own zustand-persist writes: any store update in the page still on
  // screen re-writes this key from the *previous* repo's state, and when that lands between our
  // setItem and the navigation the reloaded app rehydrates the old repo. `repo-view` shows up
  // either way, so this step used to report success while every following step silently ran
  // against the wrong repository. Verify what the app rehydrated, and re-seed if it lost the race.
  for (let attempt = 0; attempt < 3; attempt++) {
    await seedAndReload(repoPath)
    if ((await openedRepo()) === repoPath) return
  }
  throw new Error(
    `The app never opened ${repoPath} — the localStorage seed kept losing the race against the app's own persisted state (last opened: ${await openedRepo()})`
  )
})
