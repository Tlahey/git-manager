import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { clickViaJs } from '../support/interactions'
import { storedCardTitled, storedCardTitledOrThrow, switchToRawMarkdown } from '../support/board'

/**
 * Steps for the card's activity feed (`features/board-card-activity.feature`) — the History tab's
 * field-by-field entries, and a threaded discussion.
 *
 * Everything board-level (opening the board, creating one, adding a card, opening the record,
 * writing a comment, the stored-comment assertion) comes from `board.steps.ts` /
 * `board-cards.steps.ts`; Cucumber matches by text across files, so this file only holds what is new.
 *
 * Two shapes recur, both forced by the feature rather than chosen:
 *
 * - **Nothing here has a stable testid.** A comment's row is `card-comment-<generated id>` and a
 *   history row is `card-history-entry-<short oid>`, so every step resolves its row by the text a
 *   reader would recognise — the comment's own body, the field's label.
 * - **The panel re-reads on every write.** `useCardHistory` reloads whenever the card's revision
 *   moves, and a card's revision is the *board's* ref tip, so an assertion that runs the instant
 *   after an edit can land on the feed as it was one write ago. Every assertion below polls.
 */

/** Rows of the activity feed, by kind — read in-page, never through a handle held across a
 * re-render (a write re-renders the whole panel). */
function activityRows(prefix: 'card-comment-' | 'card-history-entry-'): Promise<string[]> {
  return browser.execute(
    (sel: string) =>
      Array.from(document.querySelectorAll(`li[data-testid^="${sel}"]`)).map((el) =>
        (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      ),
    prefix
  )
}

// ─── The tabs ──────────────────────────────────────────────────────────────

// "All" / "Comments" / "History", named as they read on screen and resolved to the testid
// `CardActivitySection` keys them by. Clicked through the page for the same reason the rest of the
// board's controls are: this provider's native click doesn't always reach a button rendered inside
// a Radix dialog that has just re-rendered under it.
When(/^I open the "(All|Comments|History)" activity tab$/, async (label: string) => {
  const tab = `card-activity-tab-${label.toLowerCase()}`
  await clickViaJs(tab)
  await browser.waitUntil(
    async () =>
      (await browser.execute(
        (id: string) =>
          document.querySelector(`[data-testid="${id}"]`)?.getAttribute('aria-selected') ?? null,
        tab
      )) === 'true',
    { timeout: 10000, timeoutMsg: `the "${label}" activity tab never became the selected one` }
  )
})

// ─── The history ───────────────────────────────────────────────────────────

Then(
  /^the card history records "([^"]*)" changing from "([^"]*)" to "([^"]*)"$/,
  async (field: string, from: string, to: string) => {
    const holds = async () =>
      (await activityRows('card-history-entry-')).some(
        (text) => text.includes(field) && text.includes(from) && text.includes(to)
      )
    try {
      await browser.waitUntil(holds, { timeout: 15000 })
    } catch {
      // Built in the catch rather than as `timeoutMsg`: that string is evaluated before the first
      // poll, so it could only ever report the feed as it was when the step started.
      throw new Error(
        `no history entry reads "${field}" ${from} → ${to} — the feed holds ${JSON.stringify(
          await activityRows('card-history-entry-')
        )}`
      )
    }
  }
)

// The oldest entry a card can have, and the one that proves the walk stops where the card began
// rather than running the whole ref (`card_history`'s doc comment).
Then(/^the card history records the card being created$/, async () => {
  await browser.waitUntil(
    async () => (await activityRows('card-history-entry-')).some((t) => t.includes('Card created')),
    { timeout: 15000, timeoutMsg: 'the history feed never showed the card being created' }
  )
})

Then(/^the card history is not listed$/, async () => {
  const rows = await activityRows('card-history-entry-')
  if (rows.length > 0) {
    throw new Error(`the feed still lists ${rows.length} history row(s): ${JSON.stringify(rows)}`)
  }
})

// ─── The discussion ────────────────────────────────────────────────────────

/** The testid of the comment row whose body contains `body`. */
async function commentRowTestId(body: string): Promise<string> {
  const testid = await browser.execute(
    (wanted: string) =>
      Array.from(document.querySelectorAll('li[data-testid^="card-comment-"]'))
        .find((el) => (el.textContent ?? '').includes(wanted))
        ?.getAttribute('data-testid') ?? null,
    body
  )
  if (!testid) throw new Error(`the card record shows no comment reading "${body}"`)
  return testid
}

/**
 * Replies to a comment: arm the reply target on the comment's own row, then write into the same box
 * a top-level comment goes through.
 *
 * The reply button only exists in the Comments tab and only on a local board
 * (`CardActivitySection`'s `repliesEnabled`), so a scenario has to open that tab first — the step
 * fails on the missing button rather than silently writing a top-level comment, which is the
 * failure worth having: the two are indistinguishable on screen until the thread is looked at.
 */
When(/^I reply "([^"]*)" to the comment "([^"]*)"$/, async (body: string, parentBody: string) => {
  const parent = await commentRowTestId(parentBody)
  const replyButton = parent.replace('card-comment-', 'card-comment-reply-')
  await clickViaJs(replyButton)
  // The armed target is the observable proof the click landed — without it the text below would be
  // written as a new top-level comment, and the thread assertion would fail two steps later with
  // nothing to say about why.
  await $('[data-testid="card-comment-reply-target"]').waitForDisplayed({ timeout: 10000 })

  await switchToRawMarkdown('card-comment-input')
  const input = $('[data-testid="card-comment-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(body)
  await $('[data-testid="card-comment-submit"]').click()
  // Emptied only once the write resolved (`CardActivitySection.submit`), and the armed target is
  // dropped in the same breath — so both are the step's own proof rather than a convenience.
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const el = document.querySelector(
          '[data-testid="card-comment-input"]'
        ) as HTMLTextAreaElement | null
        return (
          el?.value === '' &&
          document.querySelector('[data-testid="card-comment-reply-target"]') === null
        )
      }),
    { timeout: 15000, timeoutMsg: 'the comment box never emptied — the reply was not accepted' }
  )
})

Then(
  /^the card record threads "([^"]*)" under "([^"]*)"$/,
  async (body: string, parentBody: string) => {
    // Nesting, not adjacency — and the nesting is one level out from the row that carries the
    // testid: `CardActivityCommentThread` wraps each comment in an `<li>` of its own (the indent),
    // puts `CardActivityCommentRow`'s testid-bearing `<li>` inside it, and hangs the replies off a
    // `<ul>` beside that row. So the shape that can only be true of a thread is "the reply's row
    // sits in the list under the parent's wrapper", never "the parent's row contains it".
    const nested = () =>
      browser.execute(
        (wantedParent: string, wantedChild: string) => {
          const rows = Array.from(document.querySelectorAll('li[data-testid^="card-comment-"]'))
          const parentRow = rows.find((el) => (el.textContent ?? '').includes(wantedParent))
          const replies = parentRow?.parentElement?.querySelector(':scope > ul')
          if (!replies) return false
          return Array.from(replies.querySelectorAll('li[data-testid^="card-comment-"]')).some(
            (el) => (el.textContent ?? '').includes(wantedChild)
          )
        },
        parentBody,
        body
      )
    await browser.waitUntil(nested, {
      timeout: 15000,
      timeoutMsg: `"${body}" is not threaded under "${parentBody}"`,
    })
  }
)

Then(
  /^the reply "([^"]*)" is marked as answering "([^"]*)"$/,
  async (body: string, author: string) => {
    await browser.waitUntil(
      async () =>
        (await activityRows('card-comment-')).some(
          (text) => text.includes(body) && text.includes(`replying to ${author}`)
        ),
      {
        timeout: 15000,
        timeoutMsg: `no comment row reads "${body}" with a "replying to ${author}" annotation`,
      }
    )
  }
)

Then(
  /^the card "([^"]*)" stores "([^"]*)" as a reply to "([^"]*)"$/,
  async (title: string, body: string, parentBody: string) => {
    const linked = () => {
      const card = storedCardTitled(title)
      if (!card) return false
      const parent = card.comments.find((comment) => comment.body === parentBody)
      const reply = card.comments.find((comment) => comment.body === body)
      return Boolean(parent && reply && reply.parentCommentId === parent.id)
    }
    try {
      await browser.waitUntil(async () => linked(), { timeout: 15000 })
    } catch {
      throw new Error(
        `the stored card "${title}" does not hold "${body}" as a reply to "${parentBody}" — its comments are ${JSON.stringify(
          storedCardTitledOrThrow(title).comments
        )}`
      )
    }
  }
)
