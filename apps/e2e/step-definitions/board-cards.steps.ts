import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import {
  blurActiveElement,
  clickViaJs,
  openMenuViaJs,
  setNativeSelectValue,
} from '../support/interactions'
import {
  activeBoardName,
  boardRefNamed,
  boardRefs,
  cardTestIdOrThrow,
  closeDialog,
  columnIdByName,
  openCard,
  storedBoard,
  storedCardTitled,
  storedCardTitledOrThrow,
  storedCards,
  switchToRawMarkdown,
  type StoredBoard,
  type StoredCard,
} from '../support/board'

/**
 * Steps for the card *record* and the board's own shape (`features/board-cards.feature`) — the
 * checklist, the discussion, the side panel's fields, the relations between cards, the column
 * editor, the board settings, deleting a card and moving one to another sprint.
 *
 * The board-level steps this file's scenarios open with (`I open the board`, `I create a board
 * named …`, `I add a card titled … to the … column`, the column-count and stored-card assertions)
 * come from `board.steps.ts`; Cucumber matches by text across every step file, so they are reused
 * rather than restated. Everything both files need to resolve a card, a column or a board ref lives
 * in `support/board.ts`.
 *
 * Three shapes recur here, each for a reason paid for in a debugging round:
 *
 * - **The open card's title is remembered** (`openCardTitle`). Almost every step inside the record —
 *   ticking a checklist item, saving a field — has no card name in its own text, because a reader
 *   already knows which card is open; the assertions still have to find that card's blob on disk.
 * - **A field edit waits for the record to show its own new value**, not just for the write to land.
 *   On a local board a card's `revision` is the *board's* ref tip, so it moves on every write; the
 *   next edit is only safe once the page has re-read the card, and the field rendering the value it
 *   was just given is the observable proof of that. Waiting on the disk alone leaves the next edit
 *   presenting a revision that is one write behind, which the backend correctly rejects.
 * - **A toggle is re-checked after being clicked.** A dispatched click is sometimes delivered twice
 *   on this driver (see README.md), which on a checkbox means "on, then off again" — invisible
 *   unless the step verifies where it landed.
 */

/** The card whose record is open, so the steps inside it can name it on disk. */
let openCardTitle: string | null = null

function currentCardTitle(): string {
  if (!openCardTitle) throw new Error('no card record is open — a step needs `I open the card "…"`')
  return openCardTitle
}

// ─── Small shared primitives ───────────────────────────────────────────────

/** Waits for the card titled `title` to satisfy `predicate` on disk, reporting what it holds. */
async function waitForStoredCard(
  title: string,
  predicate: (card: StoredCard) => boolean,
  what: string
): Promise<void> {
  try {
    await browser.waitUntil(
      () => {
        const card = storedCardTitled(title)
        return card !== null && predicate(card)
      },
      { timeout: 15000 }
    )
  } catch {
    // Built in the catch rather than as `timeoutMsg`, which is a plain string evaluated before the
    // first poll and can therefore only report the state the step started in.
    throw new Error(
      `the stored card "${title}" is not ${what} — it holds ${JSON.stringify(
        storedCardTitled(title)
      )}`
    )
  }
}

/** The stored board on screen. Resolved by the sidebar's current row when a scenario has more than
 * one board. */
async function currentStoredBoard(): Promise<StoredBoard> {
  const refs = boardRefs()
  if (refs.length === 1) return storedBoard(refs[0])
  const shown = await activeBoardName()
  const hit = refs.map(storedBoard).find((board) => shown.includes(board.name))
  if (!hit)
    throw new Error(`the board sidebar reads "${shown}", which is none of the stored boards`)
  return hit
}

/** An element's trimmed text, read in-page — never through a handle held across a re-render. */
function textOf(testid: string): Promise<string | null> {
  return browser.execute(
    (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null,
    testid
  )
}

function checkedState(testid: string): Promise<boolean | null> {
  return browser.execute((id: string) => {
    const input = document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null
    return input ? input.checked : null
  }, testid)
}

/**
 * Clicks a `Checkbox`/`Switch` and makes sure it actually landed on `expected`.
 *
 * `clickViaJs` is required at all (the real input is a full-size transparent overlay the driver
 * reads as not displayed), and it is exactly the dispatch README.md records as sometimes arriving
 * twice — which on a toggle flips forward and straight back. Same repair as
 * `sidebar-navigation.steps.ts`'s pin toggle: verify, and re-click until it sticks.
 */
async function toggleTo(testid: string, expected: boolean): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await clickViaJs(testid)
    const landed = await browser
      .waitUntil(async () => (await checkedState(testid)) === expected, { timeout: 2000 })
      .then(() => true)
      .catch(() => false)
    if (landed) return
  }
  throw new Error(
    `the "${testid}" toggle never stayed ${expected ? 'on' : 'off'} (it reads ${await checkedState(testid)})`
  )
}

/**
 * Types into a field the driver can reach, then takes the focus away.
 *
 * Several fields here commit **on blur** rather than on a button — the checklist's draft row, the
 * blocking reason — and inside a modal that covers the screen there is nothing neutral to click.
 */
async function typeAndCommit(testid: string, value: string): Promise<void> {
  const field = $(`[data-testid="${testid}"]`)
  await field.waitForDisplayed({ timeout: 10000 })
  await field.setValue(value)
  await blurActiveElement()
}

/** Whether the row `rowTestId` contains an element matching `selector`. */
function rowContains(rowTestId: string, selector: string): Promise<boolean> {
  return browser.execute(
    (id: string, sel: string) => {
      const row = document.querySelector(`[data-testid="${id}"]`)
      return row !== null && row.querySelector(sel) !== null
    },
    rowTestId,
    selector
  )
}

/**
 * Opens one side-panel field's choices, performs the edit, and waits for the **row** to render the
 * value it was given.
 *
 * The row is the signal rather than the disk, and that is the point: it renders straight off the
 * card the page holds, so it can only show the new value once the card has been re-read — which is
 * the precondition the *next* edit needs, for the revision reason in this file's header. Waiting on
 * the write alone would leave the following edit presenting a revision one write behind.
 *
 * `settled` is per field rather than "the text changed", since a field can be given the value it
 * already showed.
 *
 * Opened through `openMenuViaJs`: the value cell is a Radix `PopoverTrigger`, which opens on
 * `pointerdown` — a driver `.click()` leaves it shut and the step then times out on choices that
 * were never going to render (same reason as the card's `⋯` menu).
 */
async function editField(
  rowTestId: string,
  edit: () => Promise<void>,
  settled: () => Promise<boolean>
): Promise<void> {
  await openMenuViaJs(`${rowTestId}-edit`)
  await edit()
  try {
    await browser.waitUntil(settled, { timeout: 15000 })
  } catch {
    throw new Error(
      `the "${rowTestId}" field never showed the value it was given — it reads ${JSON.stringify(
        await textOf(rowTestId)
      )}`
    )
  }
}

/**
 * Closes the card record if it is (still) on screen.
 *
 * Deleting a card or moving it to another board is confirmed in a dialog opened *from* the record,
 * and closing that one returns to where it came from (`useBoardDialogs.returnToOrigin`) — so the
 * record briefly reopens on a card that is on its way out, until the refetch drops it. Whether that
 * flash is still up when the next step runs is a race, and a step that clicks the board underneath
 * a leftover modal fails for a reason that has nothing to do with what it was testing.
 */
async function dismissCardRecordIfOpen(): Promise<void> {
  const present = () =>
    browser.execute(() => document.querySelector('[data-testid="board-card-dialog"]') !== null)
  // Long enough for the reopen to have happened if it is going to: it is one render after the
  // dialog that triggered it closes.
  await browser.pause(500)
  if (await present()) await closeDialog('board-card-dialog')
}

// ─── Opening and closing the record ────────────────────────────────────────

When(/^I open the card "([^"]*)"$/, async (title: string) => {
  await openCard(title)
  openCardTitle = title
})

When(/^I close the card record$/, async () => {
  await closeDialog('board-card-dialog')
  openCardTitle = null
})

// ─── The Definition of Done ────────────────────────────────────────────────

interface ChecklistRow {
  /** The item's line index in the stored markdown — what its testids are keyed by. */
  index: string
  text: string
  done: boolean
}

/** The checklist as the record renders it. */
function shownChecklist(): Promise<ChecklistRow[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('[data-testid^="card-dod-item-"]')).map((row) => {
      const text = row.querySelector('[data-testid^="card-dod-text-"]') as HTMLInputElement | null
      const check = row.querySelector('[data-testid^="card-dod-check-"]') as HTMLInputElement | null
      return {
        index: (row.getAttribute('data-testid') ?? '').replace('card-dod-item-', ''),
        text: text ? text.value.trim() : '',
        done: Boolean(check?.checked),
      }
    })
  )
}

/** The same list, read out of the stored markdown — GFM's checkbox syntax, like `dodChecklist.ts`. */
function storedChecklist(title: string): { text: string; done: boolean }[] {
  const items: { text: string; done: boolean }[] = []
  for (const line of storedCardTitledOrThrow(title).dod.split('\n')) {
    const match = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s?(.*)$/)
    if (match) items.push({ text: match[4].trim(), done: match[3].toLowerCase() === 'x' })
  }
  return items
}

/**
 * Waits for a checklist edit to be both **written** and **on screen**, and for the two to agree.
 *
 * Neither half is enough on its own. The section keeps an optimistic copy while its write is in
 * flight and drops it the moment the write resolves — but the refetch that brings the real value
 * back is not awaited, so for an instant the editor renders the *previous* checklist again. A step
 * that typed the next item into that window would build it on the stale string and silently lose the
 * one before it. `expected` is what the edit was for, so a poll can't be satisfied by the state the
 * step started in.
 */
async function waitForChecklistSettled(
  expected: (items: { text: string; done: boolean }[]) => boolean
): Promise<void> {
  const title = currentCardTitle()
  const agree = async () => {
    const stored = storedChecklist(title)
    if (!expected(stored)) return false
    const shown = await shownChecklist()
    return (
      shown.length === stored.length &&
      shown.every((row, i) => row.text === stored[i].text && row.done === stored[i].done)
    )
  }
  try {
    await browser.waitUntil(agree, { timeout: 15000 })
  } catch {
    throw new Error(
      `the checklist never settled — stored ${JSON.stringify(
        storedChecklist(title)
      )}, shown ${JSON.stringify(await shownChecklist())}`
    )
  }
}

When(/^I add the checklist item "([^"]*)"$/, async (text: string) => {
  // The draft row has no button: Enter or losing the focus is what submits it.
  await typeAndCommit('card-dod-add-input', text)
  await waitForChecklistSettled((items) => items.some((item) => item.text === text))
})

When(/^I tick the checklist item "([^"]*)"$/, async (text: string) => {
  const row = (await shownChecklist()).find((item) => item.text === text)
  if (!row) throw new Error(`the card's checklist has no item "${text}"`)
  await toggleTo(`card-dod-check-${row.index}`, true)
  await waitForChecklistSettled((items) => items.some((i) => i.text === text && i.done))
})

Then(/^the card record's checklist reads "([^"]*)"$/, async (progress: string) => {
  await browser.waitUntil(async () => (await textOf('card-dod-progress')) === progress, {
    timeout: 15000,
    timeoutMsg: `the card record's checklist progress never read "${progress}"`,
  })
})

Then(
  /^the card "([^"]*)" shows the checklist progress "([^"]*)"$/,
  async (title: string, progress: string) => {
    const testid = await cardTestIdOrThrow(title)
    await expect($(`[data-testid="${testid}"] [data-testid="board-card-dod"]`)).toHaveText(progress)
  }
)

Then(
  /^the card "([^"]*)" stores "([^"]*)" as (done|still to do)$/,
  async (title: string, item: string, state: string) => {
    const done = state === 'done'
    await waitForStoredCard(
      title,
      () => storedChecklist(title).some((row) => row.text === item && row.done === done),
      `holding "${item}" as ${state}`
    )
  }
)

// ─── The discussion ────────────────────────────────────────────────────────

When(/^I write the comment "([^"]*)"$/, async (body: string) => {
  await switchToRawMarkdown('card-comment-input')
  const input = $('[data-testid="card-comment-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(body)
  await $('[data-testid="card-comment-submit"]').click()
  // The box is only emptied once the write resolved (`CardCommentsSection.submit`), so this is the
  // step's own proof rather than a convenience.
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => {
        const el = document.querySelector(
          '[data-testid="card-comment-input"]'
        ) as HTMLTextAreaElement | null
        return el ? el.value : null
      })) === '',
    { timeout: 15000, timeoutMsg: 'the comment box never emptied — the comment was not accepted' }
  )
})

Then(/^the card record shows the comment "([^"]*)"$/, async (body: string) => {
  // `li[data-testid^="card-comment-"]`, not the bare prefix: the input and the submit button carry
  // the same one.
  await browser.waitUntil(
    async () =>
      browser.execute(
        (wanted: string) =>
          Array.from(document.querySelectorAll('li[data-testid^="card-comment-"]')).some((el) =>
            (el.textContent ?? '').includes(wanted)
          ),
        body
      ),
    { timeout: 15000, timeoutMsg: `the card record shows no comment reading "${body}"` }
  )
})

Then(/^the card "([^"]*)" stores the comment "([^"]*)"$/, async (title: string, body: string) => {
  await waitForStoredCard(
    title,
    (card) => card.comments.some((comment) => comment.body === body),
    `holding a comment "${body}"`
  )
})

// ─── The description ───────────────────────────────────────────────────────

/**
 * Writes the card's description: click the rendered text to edit it, type the raw markdown, save.
 *
 * There is no pencil — the rendered block *is* the editor's trigger (`CardDescriptionField`), which
 * is also why the step waits for the field to come back **rendered**: the save button's own spinner
 * clears before the card has been re-read, and the next step reads the render.
 */
When(/^I give the card the description "([^"]*)"$/, async (markdown: string) => {
  await clickViaJs('card-description-display')
  await switchToRawMarkdown('card-description-input')
  const input = $('[data-testid="card-description-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(markdown)
  await $('[data-testid="card-description-save"]').click()
  await $('[data-testid="card-description-display"]').waitForDisplayed({ timeout: 15000 })
})

// Markdown *rendered*, not printed: the assertion is on the element the renderer produced, since
// "the text contains parquet" would be just as true of a card showing its own asterisks — which is
// the bug this pins.
Then(/^the card record renders "([^"]*)" in bold$/, async (text: string) => {
  await browser.waitUntil(
    async () =>
      browser.execute((wanted: string) => {
        const rendered = document.querySelector('[data-testid="card-description-display"]')
        return Array.from(rendered?.querySelectorAll('strong') ?? []).some((el) =>
          (el.textContent ?? '').includes(wanted)
        )
      }, text),
    { timeout: 15000, timeoutMsg: `the card record renders no bold "${text}"` }
  )
})

Then(
  /^the card "([^"]*)" is stored with the description "([^"]*)"$/,
  async (title: string, markdown: string) => {
    await waitForStoredCard(
      title,
      (card) => card.description === markdown,
      `stored with the description "${markdown}"`
    )
  }
)

// The row only carries a snippet when the description is the *sole* reason the card matched
// (`searchCards`), and it carries it as plain text — so this asserts both that the search read the
// description and that what it quotes back is readable rather than raw markdown.
Then(
  /^the search result for "([^"]*)" quotes "([^"]*)"$/,
  async (title: string, snippet: string) => {
    await browser.waitUntil(
      async () =>
        browser.execute(
          (wantedTitle: string, wantedSnippet: string) =>
            Array.from(document.querySelectorAll('[data-testid^="board-search-result-"]')).some(
              (row) => {
                const text = (row.textContent ?? '').replace(/\s+/g, ' ')
                return text.includes(wantedTitle) && text.includes(wantedSnippet)
              }
            ),
          title,
          snippet
        ),
      { timeout: 15000, timeoutMsg: `no search result for "${title}" quotes "${snippet}"` }
    )
  }
)

// ─── Blocking ──────────────────────────────────────────────────────────────

When(/^I turn the blocked switch on$/, async () => {
  await toggleTo('card-blocked-switch', true)
})

Then(/^the card record asks for a blocking reason$/, async () => {
  await $('[data-testid="card-blocked-reason-required"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the card "([^"]*)" is not stored as blocked$/, async (title: string) => {
  // Held for a stretch rather than checked once: the point is that flipping the switch writes
  // *nothing*, and a write that has not been issued yet looks exactly like one that never will.
  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    const reason = storedCardTitledOrThrow(title).blockedReason
    if (reason) throw new Error(`the card "${title}" was stored as blocked on "${reason}"`)
    await browser.pause(200)
  }
})

When(/^I give the blocking reason "([^"]*)"$/, async (reason: string) => {
  // Commits on blur, like the checklist draft — the switch and the reason are one field.
  await typeAndCommit('card-blocked-reason-input', reason)
  await waitForStoredCard(
    currentCardTitle(),
    (card) => card.blockedReason === reason,
    `blocked on "${reason}"`
  )
})

Then(
  /^the card "([^"]*)" is stored as blocked on "([^"]*)"$/,
  async (title: string, reason: string) => {
    await waitForStoredCard(
      title,
      (card) => card.blockedReason === reason,
      `blocked on "${reason}"`
    )
  }
)

Then(/^the card "([^"]*)" is flagged as blocked on the board$/, async (title: string) => {
  const testid = await cardTestIdOrThrow(title)
  await $(`[data-testid="${testid}"] [data-testid="board-card-blocked"]`).waitForExist({
    timeout: 15000,
  })
})

// ─── The side panel's fields ───────────────────────────────────────────────

When(/^I assign the card to "([^"]*)"$/, async (name: string) => {
  await editField(
    'card-meta-assignee',
    async () => {
      await $('[data-testid="card-assignee-field"]').waitForDisplayed({ timeout: 10000 })
      await $('[data-testid="card-assignee-search"]').setValue(name)
      // A repository with no connected GitHub account has no directory to pick from, so a typed
      // name is offered as itself — which is the path a local board actually takes.
      await $('[data-testid="card-assignee-use-name"]').click()
    },
    // The picker closes on picking, so the row is back to its value alone.
    async () => (await textOf('card-meta-assignee'))?.includes(name) === true
  )
})

When(/^I set the card priority to "([^"]*)"$/, async (label: string) => {
  const value = label.toLowerCase()
  await editField(
    'card-meta-priority',
    () => clickViaJs(`card-priority-option-${value}`),
    // The choices are portalled out of the row, so the row's own glyph is an unambiguous signal.
    () => rowContains('card-meta-priority', `[data-testid="card-priority-${value}"]`)
  )
})

When(/^I set the card due date to "([^"]*)"$/, async (date: string) => {
  await editField(
    'card-meta-due-date',
    async () => {
      // A native date input takes neither `setValue` nor a plain assignment reliably on this
      // driver; written through the prototype's setter with both events a controlled React input
      // listens for.
      await $('[data-testid="card-due-date-input"]').waitForExist({ timeout: 10000 })
      await browser.execute((value: string) => {
        const input = document.querySelector(
          '[data-testid="card-due-date-input"]'
        ) as HTMLInputElement | null
        if (!input) throw new Error('the due-date input is not on screen')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }, date)
    },
    async () => (await textOf('card-meta-due-date'))?.includes(date) === true
  )
})

When(/^I tag the card "([^"]*)"$/, async (name: string) => {
  await editField(
    'card-meta-tags',
    async () => {
      await $('[data-testid="card-tag-picker"]').waitForDisplayed({ timeout: 10000 })
      await $('[data-testid="card-tag-search"]').setValue(name)
      // Creating adds the tag to the *board's* palette and puts it on the card, in that order — see
      // `useCardTagCreation`.
      await $('[data-testid="card-tag-create"]').click()
    },
    // The tag picker stays open after creating one, so the badge in the row's own list is the
    // signal — not the row's text, which the picker's option contributes to as well.
    () => rowContains('card-meta-tags', '[data-testid^="card-meta-tag-"]')
  )
})

Then(
  /^the card "([^"]*)" is stored as assigned to "([^"]*)"$/,
  async (title: string, name: string) => {
    await waitForStoredCard(title, (card) => card.assignee === name, `assigned to "${name}"`)
  }
)

Then(
  /^the card "([^"]*)" is stored with the priority "([^"]*)"$/,
  async (title: string, priority: string) => {
    await waitForStoredCard(
      title,
      (card) => card.priority === priority,
      `at priority "${priority}"`
    )
  }
)

Then(
  /^the card "([^"]*)" is stored with the due date "([^"]*)"$/,
  async (title: string, date: string) => {
    await waitForStoredCard(title, (card) => card.dueDate === date, `due on "${date}"`)
  }
)

Then(
  /^the card "([^"]*)" is stored with the tag "([^"]*)"$/,
  async (title: string, tagName: string) => {
    // Resolved through the board's palette rather than assuming the id is the slug: a card holds tag
    // *ids*, and what the scenario says is the name the user typed.
    const board = await currentStoredBoard()
    const tag = board.tags.find((t) => t.name === tagName)
    if (!tag) throw new Error(`the board's palette holds no tag named "${tagName}"`)
    await waitForStoredCard(title, (card) => card.tagIds.includes(tag.id), `tagged "${tagName}"`)
  }
)

Then(/^the board offers the tag "([^"]*)"$/, async (tagName: string) => {
  const board = await currentStoredBoard()
  expect(board.tags.map((tag) => tag.name)).toContain(tagName)
})

// ─── Relations ─────────────────────────────────────────────────────────────

/** The relation as the picker offers it, keyed by the option's own label. */
const RELATION_VALUES: Record<string, string> = {
  Contains: 'contains',
  'Is part of': 'partOf',
  Blocks: 'blocks',
  'Is blocked by': 'blockedBy',
  'Relates to': 'relates',
}

/** The heading each group of relations is listed under, which is not the same wording. */
const RELATION_GROUPS: Record<string, string> = {
  Contains: 'contains',
  'Part of': 'partOf',
  Blocks: 'blocks',
  'Blocked by': 'blockedBy',
  'Relates to': 'relates',
}

When(/^I link the card "([^"]*)" as "([^"]*)"$/, async (targetTitle: string, relation: string) => {
  const kind = RELATION_VALUES[relation]
  if (!kind) throw new Error(`no such relation: "${relation}"`)
  await $('[data-testid="card-links-add"]').click()
  await $('[data-testid="card-link-draft"]').waitForDisplayed({ timeout: 10000 })
  // `card-link-kind` is a `@git-manager/ui` `Select` (Radix), not a native one — same open-on-
  // pointerdown quirk as a `DropdownMenuTrigger`, hence the JS dispatch rather than `setNativeSelectValue`.
  await openMenuViaJs('card-link-kind')
  await clickViaJs(`card-link-kind-${kind}`)
  await $('[data-testid="card-link-search"]').setValue(targetTitle)
  // The candidate rows are keyed by card id, which is generated per write — resolved by title.
  const optionTestId = await browser.execute((wanted: string) => {
    const options = Array.from(document.querySelectorAll('[data-testid^="card-link-option-"]'))
    const hit = options.find((el) => (el.textContent ?? '').includes(wanted))
    return hit ? hit.getAttribute('data-testid') : null
  }, targetTitle)
  if (!optionTestId) throw new Error(`the link picker offers no card titled "${targetTitle}"`)
  await $(`[data-testid="${optionTestId}"]`).click()
  // Picking a candidate only fills the field (CardLinkDraftRow.pick) — the confirm button is what
  // writes, so the draft row only closes once that click's write resolves.
  await $('[data-testid="card-link-draft-add"]').click()
  await $('[data-testid="card-link-draft"]').waitForExist({ reverse: true, timeout: 15000 })
})

Then(
  /^the card record lists "([^"]*)" under "([^"]*)"$/,
  async (targetTitle: string, group: string) => {
    const kind = RELATION_GROUPS[group]
    if (!kind) throw new Error(`no such relation group: "${group}"`)
    try {
      await browser.waitUntil(
        async () =>
          browser.execute(
            (groupKind: string, wanted: string) => {
              const section = document.querySelector(
                `[data-testid="card-links-group-${groupKind}"]`
              )
              if (!section) return false
              return Array.from(section.querySelectorAll('li')).some((row) =>
                (row.textContent ?? '').includes(wanted)
              )
            },
            kind,
            targetTitle
          ),
        { timeout: 15000 }
      )
    } catch {
      throw new Error(
        `the card record does not list "${targetTitle}" under "${group}" — its relations read ${JSON.stringify(
          await textOf('card-links-section')
        )}`
      )
    }
  }
)

Then(
  /^the card "([^"]*)" stores a "([^"]*)" relation to the card "([^"]*)"$/,
  async (ownerTitle: string, kind: string, targetTitle: string) => {
    const target = storedCardTitledOrThrow(targetTitle)
    await waitForStoredCard(
      ownerTitle,
      (card) =>
        card.links.some(
          (link) =>
            link.kind === kind &&
            link.targetCardId === target.id &&
            link.targetBoardId === target.boardId
        ),
      `holding a "${kind}" link to "${targetTitle}" (${target.id})`
    )
  }
)

Then(/^the card "([^"]*)" stores no relation of its own$/, async (title: string) => {
  await waitForStoredCard(title, (card) => card.links.length === 0, 'free of stored links')
})

When(/^I remove the relation to "([^"]*)"$/, async (title: string) => {
  // The remove button is keyed by the card at the *other* end, whose id is generated per write —
  // resolved through the row that names it, which also proves the row is the one being read.
  const testid = await browser.execute((wanted: string) => {
    const rows = Array.from(document.querySelectorAll('li[data-testid^="card-link-"]'))
    const hit = rows.find((row) => (row.textContent ?? '').includes(wanted))
    return hit
      ? (hit.querySelector('[data-testid^="card-link-remove-"]')?.getAttribute('data-testid') ??
          null)
      : null
  }, title)
  if (!testid) throw new Error(`the card record lists no relation to "${title}"`)
  await $(`[data-testid="${testid}"]`).click()
  await $(`[data-testid="${testid}"]`).waitForExist({ reverse: true, timeout: 15000 })
})

Then(/^the card record lists no relation$/, async () => {
  await $('[data-testid="card-links-empty"]').waitForDisplayed({ timeout: 15000 })
})

// ─── The column editor ─────────────────────────────────────────────────────

/** Mirrors `ColumnEditorDialog.slugify`, which is what a new column's id is derived from. */
function columnSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The id of the editor row whose name field reads `name` — the only handle a renamed column has. */
async function columnEditorRowId(name: string): Promise<string> {
  const id = await browser.execute((wanted: string) => {
    const rows = Array.from(document.querySelectorAll('[data-testid^="column-editor-row-"]'))
    const hit = rows.find((row) => {
      const input = row.querySelector(
        'input[type="text"], input:not([type])'
      ) as HTMLInputElement | null
      return input?.value.trim() === wanted
    })
    return hit ? (hit.getAttribute('data-testid') ?? '').replace('column-editor-row-', '') : null
  }, name)
  if (!id) throw new Error(`the column editor has no row named "${name}"`)
  return id
}

When(/^I open the column editor$/, async () => {
  await $('[data-testid="board-edit-columns-button"]').click()
  await $('[data-testid="column-editor-dialog"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I add the column "([^"]*)"$/, async (name: string) => {
  await $('[data-testid="column-editor-new-name"]').setValue(name)
  await $('[data-testid="column-editor-add"]').click()
  await $(`[data-testid="column-editor-row-${columnSlug(name)}"]`).waitForDisplayed({
    timeout: 10000,
  })
})

When(/^I flag the column "([^"]*)" as counting for done$/, async (name: string) => {
  await toggleTo(`column-editor-done-${await columnEditorRowId(name)}`, true)
})

When(/^I remove the column "([^"]*)"$/, async (name: string) => {
  const id = await columnEditorRowId(name)
  await $(`[data-testid="column-editor-remove-${id}"]`).click()
  await $(`[data-testid="column-editor-row-${id}"]`).waitForExist({ reverse: true, timeout: 10000 })
})

When(/^I save the columns$/, async () => {
  await $('[data-testid="column-editor-save"]').click()
  await $('[data-testid="column-editor-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})

Then(/^the board stores the column "([^"]*)" as counting for done$/, async (name: string) => {
  const board = await currentStoredBoard()
  const column = board.columns.find((c) => c.name === name)
  if (!column) throw new Error(`the stored board has no column named "${name}"`)
  expect(column.isDone).toBe(true)
})

// ─── The board's settings ──────────────────────────────────────────────────

When(/^I open the board settings$/, async () => {
  await $('[data-testid="board-settings-button"]').click()
  await $('[data-testid="board-settings-dialog"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I rename the board to "([^"]*)"$/, async (name: string) => {
  await $('[data-testid="board-settings-name"]').setValue(name)
})

When(/^I add the card prefix "([^"]*)"$/, async (prefix: string) => {
  await $('[data-testid="board-settings-prefix"]').setValue(prefix)
  await $('[data-testid="board-settings-prefix-add"]').click()
  await $(`[data-testid="board-settings-prefix-${prefix}"]`).waitForDisplayed({ timeout: 10000 })
})

When(/^I remove the card prefix "([^"]*)"$/, async (prefix: string) => {
  await $(`[data-testid="board-settings-prefix-remove-${prefix}"]`).click()
  await $(`[data-testid="board-settings-prefix-${prefix}"]`).waitForExist({
    reverse: true,
    timeout: 10000,
  })
})

When(/^I add the board tag "([^"]*)"$/, async (name: string) => {
  await $('[data-testid="board-settings-new-tag"]').setValue(name)
  await $('[data-testid="board-settings-add-tag"]').click()
  await $(`[data-testid="board-settings-tag-${name}"]`).waitForDisplayed({ timeout: 10000 })
})

When(/^I save the board settings$/, async () => {
  await $('[data-testid="board-settings-save"]').click()
  await $('[data-testid="board-settings-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})

// `card-dod-add-input` is DodChecklistEditor's own testid, shared by every mount of it (a card's
// own checklist, the new-card form, the board's template) — safe to query unscoped here since the
// settings dialog is modal and no other DoD editor is on screen while it's open.
When(/^I add the DoD template item "([^"]*)"$/, async (text: string) => {
  await typeAndCommit('card-dod-add-input', text)
})

Then(/^the board offers the card prefixes "([^"]*)"$/, async (expected: string) => {
  const wanted = expected.split(',').map((prefix) => prefix.trim())
  try {
    await browser.waitUntil(
      async () =>
        JSON.stringify((await currentStoredBoard()).cardPrefixes) === JSON.stringify(wanted),
      { timeout: 15000 }
    )
  } catch {
    throw new Error(
      `the stored board offers the prefixes ${JSON.stringify(
        (await currentStoredBoard()).cardPrefixes
      )}, expected ${JSON.stringify(wanted)}`
    )
  }
})

// ─── Deleting a card ───────────────────────────────────────────────────────

When(/^I ask to delete the card$/, async () => {
  await openMenuViaJs('card-dialog-actions-menu')
  const remove = $('[data-testid="card-action-delete"]')
  await remove.waitForDisplayed({ timeout: 10000 })
  await remove.click()
})

Then(/^the delete confirmation is shown$/, async () => {
  await $('[data-testid="delete-card-dialog"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I archive the card from the delete confirmation$/, async () => {
  await $('[data-testid="delete-card-archive-instead"]').click()
  await $('[data-testid="delete-card-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})

Then(/^the card record is shown again$/, async () => {
  // Cancelling or resolving a dialog raised *from* the record comes back to it — see
  // `useBoardDialogs`'s origin trail.
  await $('[data-testid="card-meta-sidebar"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I confirm the deletion$/, async () => {
  await $('[data-testid="delete-card-confirm"]').click()
  await $('[data-testid="delete-card-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
  openCardTitle = null
  await dismissCardRecordIfOpen()
})

Then(/^the card "([^"]*)" is stored as archived$/, async (title: string) => {
  await waitForStoredCard(title, (card) => Boolean(card.archivedAt), 'archived')
})

Then(/^no card titled "([^"]*)" is stored in the repository$/, async (title: string) => {
  await browser.waitUntil(() => storedCardTitled(title) === null, {
    timeout: 15000,
    timeoutMsg: `a card titled "${title}" is still stored on a board ref`,
  })
})

// ─── Moving a card to another board ────────────────────────────────────────

When(/^I ask to move the card to another board$/, async () => {
  await openMenuViaJs('card-dialog-actions-menu')
  const move = $('[data-testid="card-action-move"]')
  await move.waitForDisplayed({ timeout: 10000 })
  await move.click()
  await $('[data-testid="move-card-dialog"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I move the card to the "([^"]*)" board$/, async (boardName: string) => {
  // The board's *id* is what the picker's options carry, and it is generated per write — read back
  // from the stored board of that name.
  const target = storedBoard(boardRefNamed(boardName))
  await setNativeSelectValue('move-target-board', target.id)
  await $('[data-testid="move-card-submit"]').click()
  await $('[data-testid="move-card-dialog"]').waitForExist({ reverse: true, timeout: 20000 })
  openCardTitle = null
  await dismissCardRecordIfOpen()
})

Then(
  /^the "([^"]*)" board stores the card "([^"]*)" in the "([^"]*)" column$/,
  async (boardName: string, title: string, columnName: string) => {
    const columnId = await columnIdByName(columnName)
    try {
      await browser.waitUntil(
        () =>
          storedCards(boardRefNamed(boardName)).some(
            (card) => card.title === title && card.columnId === columnId
          ),
        { timeout: 15000 }
      )
    } catch {
      throw new Error(
        `the "${boardName}" board does not store "${title}" in the "${columnName}" column — it stores ${JSON.stringify(
          storedCards(boardRefNamed(boardName)).map((card) => ({
            title: card.title,
            columnId: card.columnId,
          }))
        )}`
      )
    }
  }
)

Then(
  /^the "([^"]*)" board stores no card titled "([^"]*)"$/,
  async (boardName: string, title: string) => {
    await browser.waitUntil(
      () => !storedCards(boardRefNamed(boardName)).some((card) => card.title === title),
      {
        timeout: 15000,
        timeoutMsg: `the "${boardName}" board still stores a card titled "${title}"`,
      }
    )
  }
)
