import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// The sidebar's "Pull Requests" section "+" button only gets a click handler when a real GitHub
// token is configured (RepositorySidebar.tsx: `section.key === 'prs' && githubToken ? () =>
// setPrCreateOpen(true) : undefined`) — without one it renders but does nothing. The form itself
// needs no token to open or to generate a description (usePrCreateFlow's `defaultBase` fetch and
// usePrDescriptionGeneration both read local git data only; only actually publishing the PR needs
// a token). So this step opens the form through the same real store bridge the rest of this AI
// section's e2e coverage uses (`window.__e2eRepoUIStore`), calling the exact same `setPrCreateOpen`
// setter the "+" button would have called — everything downstream (the form, the real map-phase
// file summaries, the real streamed compose call) is exactly what a real click produces.
When(/^I open the create-PR form$/, async () => {
  await browser.execute(() => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: { getState: () => { setPrCreateOpen: (open: boolean) => void } }
      }
    ).__e2eRepoUIStore
    if (!store) throw new Error('__e2eRepoUIStore is not exposed on window')
    store.getState().setPrCreateOpen(true)
  })
  await $('[data-testid="pr-create"]').waitForDisplayed({ timeout: 10000 })
})

// Sets a native <select>'s value the way React can actually observe: through the native value
// setter (bypassing the instance property React's controlled-input tracker shadows) followed by a
// real bubbling 'change' event. WDIO's own `selectByAttribute` picks the right <option> in the
// WebView but — on this WKWebView driver, like several other native form controls in this suite —
// doesn't reliably raise a 'change' event React's synthetic listener picks up, so the component's
// own state (and here, the generate button's `!base` gate) never moves.
async function setNativeSelectValue(testid: string, value: string) {
  await browser.execute(
    (id: string, val: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null
      if (!el) throw new Error(`setNativeSelectValue: no element with data-testid="${id}"`)
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    testid,
    value
  )
}

When(
  /^I fill the create-PR form with head "([^"]*)" and base "([^"]*)"$/,
  async (head: string, base: string) => {
    // The <option>s only exist once useBranches' async fetch resolves — selecting before that
    // leaves the <select> without a matching option to set the value to.
    await $('[data-testid="pr-create-head"]').$(`option=${head}`).waitForExist({ timeout: 10000 })
    await $('[data-testid="pr-create-base"]').$(`option=${base}`).waitForExist({ timeout: 10000 })
    await setNativeSelectValue('pr-create-head', head)
    await setNativeSelectValue('pr-create-base', base)
  }
)

When(/^I click the generate-description button$/, async () => {
  const button = $('[data-testid="pr-create-ai"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the PR description field contains "([^"]*)"$/, async (expected: string) => {
  const body = $('[data-testid="pr-create-body"]')
  await browser.waitUntil(async () => (await body.getValue()).includes(expected), {
    timeout: 15000,
    timeoutMsg: `PR description field never contained "${expected}"`,
  })
})
