import { browser, expect, $, $$ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { clickViaJs, openMenuViaJs } from '../support/interactions'
import {
  activeBoardName,
  BOARD_REF_GLOB,
  boardRefs,
  cardTestId,
  cardTestIdOrThrow,
  closeDialog,
  columnCounts,
  columnIdByName,
  git,
  openCard,
  storedCards,
} from '../support/board'

/**
 * Steps for the Kanban board (`features/board.feature`) — creating a board, adding and moving a
 * card, closing a sprint, archiving.
 *
 * The card *record* and the board's own settings are covered by `board-cards.steps.ts`, which
 * reuses the steps here rather than restating them. Everything both files need — resolving a card
 * or a column by what a reader would call it, and reading the board's own git ref back — lives in
 * `support/board.ts`, whose doc comment explains why those two shapes exist at all.
 */

// ─── Opening the board ─────────────────────────────────────────────────────

When(/^I open the board$/, async () => {
  // The toolbar's view switcher — the one there is. Clicked in-page because its segments are
  // `<label>`s wrapping an `sr-only` radio; see `clickViaJs`.
  await clickViaJs('repo-view-board')
  // The board sidebar's "New board" button is on screen for every board state, including none at all.
  await $('[data-testid="create-board-button"]').waitForDisplayed({ timeout: 15000 })
})

async function createBoard(
  name: string,
  prefix: string,
  standing?: boolean,
  remote?: boolean
): Promise<void> {
  await $('[data-testid="create-board-button"]').click()
  await $('[data-testid="create-board-dialog"]').waitForDisplayed({ timeout: 10000 })
  await $('[data-testid="board-name-input"]').setValue(name)
  // On by default — a sprint that can be closed. Off is what makes a *standing* board: a
  // backlog that never ends and never offers to close (see BoardToolbar's `isIterationBoard`
  // gate).
  if (standing) await clickViaJs('board-iteration-input')
  await $('[data-testid="board-prefix-input"]').setValue(prefix)
  // "Local" is selected by default; picking "GitHub" needs a connected account or the
  // `VITE_MOCK_GITHUB` fixture double (`useBoardBackends.ts`) — off in a release build, on by
  // default in this e2e build (`.env.e2e`).
  if (remote) await clickViaJs('board-backend-remote')
  await $('[data-testid="create-board-submit"]').click()
  await $('[data-testid="create-board-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
  // The new board becomes the active one (`useBoardActions.createBoard`), so its columns are what
  // the next step queries — waiting for the sidebar to mark it current is what proves the switch
  // landed.
  await browser.waitUntil(async () => (await activeBoardName()).includes(name), {
    timeout: 15000,
    timeoutMsg: `the board sidebar never made "${name}" the current board`,
  })
}

When(
  /^I create a board named "([^"]*)" with the card prefix "([^"]*)"$/,
  async (name: string, prefix: string) => {
    await createBoard(name, prefix)
  }
)

When(
  /^I create a GitHub board named "([^"]*)" with the card prefix "([^"]*)"$/,
  async (name: string, prefix: string) => {
    await createBoard(name, prefix, false, true)
  }
)

When(
  /^I create a standing board named "([^"]*)" with the card prefix "([^"]*)"$/,
  async (name: string, prefix: string) => {
    await createBoard(name, prefix, true)
  }
)

Then(/^the board offers no way to close it$/, async () => {
  await expect($('[data-testid="board-close-sprint-button"]')).not.toBeExisting()
})

// ─── Cards ─────────────────────────────────────────────────────────────────

async function addCard(columnName: string, title: string, kind?: string): Promise<void> {
  const columnId = await columnIdByName(columnName)
  await $(`[data-testid="board-column-${columnId}-add-card"]`).click()
  await $('[data-testid="board-card-title-input"]').waitForDisplayed({ timeout: 10000 })
  // Task by default (CreateCardDialog's own initial state) — only touched when a scenario cares
  // which of the three kinds (Task/Bug/Epic) the card takes.
  if (kind) {
    await openMenuViaJs('card-kind-select')
    await clickViaJs(`card-kind-${kind.toLowerCase()}-option`)
  }
  await $('[data-testid="board-card-title-input"]').setValue(title)
  await $('[data-testid="board-card-save"]').click()
  // The create form is replaced by the card's own record view rather than closing — that swap is
  // what proves the card was really written (`BoardDialogsManager` only reopens on a created id).
  await $('[data-testid="card-meta-sidebar"]').waitForDisplayed({ timeout: 15000 })
  await closeDialog('board-card-dialog')
  await browser.waitUntil(async () => (await cardTestId(title)) !== null, {
    timeout: 15000,
    timeoutMsg: `the card "${title}" never appeared on the board`,
  })
}

When(
  /^I add a card titled "([^"]*)" to the "([^"]*)" column$/,
  async (title: string, columnName: string) => {
    await addCard(columnName, title)
  }
)

When(
  /^I add a "([^"]*)" card titled "([^"]*)" to the "([^"]*)" column$/,
  async (kind: string, title: string, columnName: string) => {
    await addCard(columnName, title, kind)
  }
)

Then(/^the card "([^"]*)" is shown as a "([^"]*)"$/, async (title: string, kind: string) => {
  const testid = await cardTestIdOrThrow(title)
  const icon = $(`[data-testid="${testid}"] [data-testid="card-kind-${kind.toLowerCase()}"]`)
  await expect(icon).toBeDisplayed()
})

When(
  /^I set the status of the card "([^"]*)" to "([^"]*)"$/,
  async (title: string, columnName: string) => {
    // Resolved before the dialog covers the board: the menu's items are keyed by column id, and the
    // columns are only nameable out here.
    const columnId = await columnIdByName(columnName)
    await openCard(title)
    await openMenuViaJs('card-status-picker')
    const option = $(`[data-testid="card-status-option-${columnId}"]`)
    await option.waitForDisplayed({ timeout: 10000 })
    await option.click()
    await closeDialog('board-card-dialog')
  }
)

When(/^I archive the card "([^"]*)"$/, async (title: string) => {
  await openCard(title)
  // The dialog's own `⋯`, not the card face's: the face's trigger is `opacity-0` until hovered
  // *and* shares its testid with every other card on the board.
  await openMenuViaJs('card-dialog-actions-menu')
  const archive = $('[data-testid="card-action-archive"]')
  await archive.waitForDisplayed({ timeout: 10000 })
  await archive.click()
  await closeDialog('board-card-dialog')
  await browser.waitUntil(async () => (await cardTestId(title)) === null, {
    timeout: 15000,
    timeoutMsg: `the card "${title}" is still on the board after being archived`,
  })
})

When(/^I restore the card "([^"]*)" from the archive$/, async (title: string) => {
  await $('[data-testid="board-archived-button"]').click()
  await $('[data-testid="archived-cards-dialog"]').waitForDisplayed({ timeout: 10000 })
  // The row is the `<li>`; its three action buttons share the same testid prefix.
  const rowTestId = await browser.execute((wanted: string) => {
    const rows = Array.from(document.querySelectorAll('li[data-testid^="archived-card-"]'))
    const hit = rows.find((el) => (el.textContent ?? '').includes(wanted))
    return hit ? hit.getAttribute('data-testid') : null
  }, title)
  if (!rowTestId) throw new Error(`no archived card titled "${title}"`)
  const cardId = rowTestId.replace('archived-card-', '')
  await $(`[data-testid="archived-card-unarchive-${cardId}"]`).click()
  await closeDialog('archived-cards-dialog')
})

// The toolbar's search is the global one — every ticket of every board. The left panel's field is a
// different control, narrowing the board *list*.
When(/^I search every board for "([^"]*)"$/, async (query: string) => {
  await $('[data-testid="board-search-button"]').click()
  const input = $('[data-testid="board-search-dialog-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(query)
})

Then(/^the ticket "([^"]*)" is offered by the search$/, async (title: string) => {
  await browser.waitUntil(
    async () => {
      const rows = await $$('[data-testid^="board-search-result-"]')
      for (const row of rows) if ((await row.getText()).includes(title)) return true
      return false
    },
    { timeout: 10000, timeoutMsg: `the search never offered "${title}"` }
  )
})

When(/^I close the ticket search$/, async () => {
  await browser.keys(['Escape'])
  await $('[data-testid="board-search-dialog"]').waitForDisplayed({ timeout: 10000, reverse: true })
})

When(/^I filter the board list by "([^"]*)"$/, async (query: string) => {
  const input = $('[data-testid="board-filter-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(query)
})

// ─── Sprints ───────────────────────────────────────────────────────────────

When(
  /^I close the sprint, carrying the unfinished cards into "([^"]*)"$/,
  async (successorName: string) => {
    await $('[data-testid="board-close-sprint-button"]').click()
    await $('[data-testid="close-sprint-dialog"]').waitForDisplayed({ timeout: 10000 })
    // Carrying over is the dialog's default; the name it proposes is `nextSprintName(board.name)`,
    // overwritten here so the scenario states the name it then asserts on.
    await $('[data-testid="close-sprint-next-name"]').setValue(successorName)
    // "Archive completed cards" also defaults on (CloseSprintDialog.tsx), which would file the done
    // column away rather than leave it "shown on the board" the way a reader of this scenario's own
    // prose ("a card in a done column ... stays behind") expects. Unchecked here so a closed sprint's
    // done cards stay visible rather than in the archive.
    await clickViaJs('close-sprint-archive-done')
    await $('[data-testid="close-sprint-confirm"]').click()
    await $('[data-testid="close-sprint-dialog"]').waitForExist({ reverse: true, timeout: 20000 })
  }
)

When(/^I show closed sprints$/, async () => {
  // `Checkbox`'s real input is a full-size transparent overlay the driver reads as not displayed.
  await clickViaJs('board-show-closed')
})

When(/^I select the "([^"]*)" sprint$/, async (name: string) => {
  const rowTestId = await browser.execute((wanted: string) => {
    const rows = Array.from(document.querySelectorAll('[data-testid^="board-sidebar-item-"]'))
    const hit = rows.find((el) => (el.textContent ?? '').includes(wanted))
    return hit ? hit.getAttribute('data-testid') : null
  }, name)
  if (!rowTestId) throw new Error(`the board sidebar lists no "${name}"`)
  await $(`[data-testid="${rowTestId}"]`).click()
  await browser.waitUntil(async () => (await activeBoardName()).includes(name), {
    timeout: 10000,
    timeoutMsg: `the board sidebar never switched to "${name}"`,
  })
})

When(/^I delete the board$/, async () => {
  await $('[data-testid="board-delete-button"]').click()
  await $('[data-testid="delete-board-dialog"]').waitForDisplayed({ timeout: 10000 })
})

// The checkbox is checked by default (erasure is what deleting a board has always done) — this
// opts out into the other branch: the tickets are archived rather than destroyed, and the board
// is kept, read-only, so they still have one.
When(/^I keep the board's cards instead of deleting them$/, async () => {
  await clickViaJs('delete-board-delete-cards')
})

When(/^I confirm deleting the board$/, async () => {
  await $('[data-testid="delete-board-confirm"]').click()
  await $('[data-testid="delete-board-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})

Then(/^the board "([^"]*)" is no longer listed$/, async (name: string) => {
  await browser.waitUntil(
    async () => {
      const rows = await browser.execute((wanted: string) => {
        const items = Array.from(document.querySelectorAll('[data-testid^="board-sidebar-item-"]'))
        return items.some((el) => (el.textContent ?? '').includes(wanted))
      }, name)
      return !rows
    },
    { timeout: 10000, timeoutMsg: `the board sidebar still lists "${name}"` }
  )
})

When(/^I show deleted boards$/, async () => {
  await clickViaJs('board-show-deleted')
})

// Same lookup `I select the "X" sprint` uses, kept as its own step rather than reused verbatim: a
// plain deleted board is not a sprint, and this scenario never closes one.
When(/^I select the "([^"]*)" board$/, async (name: string) => {
  const rowTestId = await browser.execute((wanted: string) => {
    const rows = Array.from(document.querySelectorAll('[data-testid^="board-sidebar-item-"]'))
    const hit = rows.find((el) => (el.textContent ?? '').includes(wanted))
    return hit ? hit.getAttribute('data-testid') : null
  }, name)
  if (!rowTestId) throw new Error(`the board sidebar lists no "${name}"`)
  await $(`[data-testid="${rowTestId}"]`).click()
  await browser.waitUntil(async () => (await activeBoardName()).includes(name), {
    timeout: 10000,
    timeoutMsg: `the board sidebar never switched to "${name}"`,
  })
})

Then(/^the board shows it was deleted$/, async () => {
  await $('[data-testid="board-deleted-banner"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the archived card "([^"]*)" is listed$/, async (title: string) => {
  await $('[data-testid="board-archived-button"]').click()
  await $('[data-testid="archived-cards-dialog"]').waitForDisplayed({ timeout: 10000 })
  const found = await browser.waitUntil(
    async () =>
      browser.execute((wanted: string) => {
        const rows = Array.from(document.querySelectorAll('li[data-testid^="archived-card-"]'))
        return rows.some((el) => (el.textContent ?? '').includes(wanted))
      }, title),
    { timeout: 10000, timeoutMsg: `no archived card titled "${title}"` }
  )
  expect(found).toBe(true)
})

// ─── What the user sees ────────────────────────────────────────────────────

Then(/^the board "([^"]*)" is shown$/, async (name: string) => {
  await browser.waitUntil(async () => (await activeBoardName()).includes(name), {
    timeout: 15000,
    timeoutMsg: `the board on screen is not "${name}"`,
  })
})

// The sidebar row's subtitle (`BoardSidebar`'s `backend.remote`/`backend.local`), concatenated onto
// the name in `activeBoardName()`'s plain `textContent` read — see that helper's own doc comment for
// why nothing on a board row has a stable testid to read the two apart by instead.
Then(/^the board "([^"]*)" is a GitHub board$/, async (name: string) => {
  await browser.waitUntil(
    async () => {
      const text = await activeBoardName()
      return text.includes(name) && text.includes('GitHub')
    },
    {
      timeout: 15000,
      timeoutMsg: `the board on screen is not "${name}" backed by GitHub`,
    }
  )
})

Then(/^the board shows the columns "([^"]*)"$/, async (expected: string) => {
  for (const name of expected.split(',').map((column) => column.trim())) {
    await columnIdByName(name)
  }
})

Then(/^the "([^"]*)" column holds (\d+) cards?$/, async (columnName: string, rawCount: string) => {
  // Coerced rather than trusted: this framework hands a `(\d+)` capture over as a **number**, so a
  // `===` against the text read out of the DOM is false however equal the two look — which is
  // exactly how it read: `holds "1", expected "1"`.
  const count = String(rawCount)
  const columnId = await columnIdByName(columnName)
  // Read in-page rather than through a held element handle: a card write re-renders the columns, and
  // a handle taken before that answers `''` for ever after, which reads as "the count never changed"
  // rather than as a stale reference.
  const shown = () =>
    browser.execute(
      (id: string) =>
        document.querySelector(`[data-testid="board-column-${id}-count"]`)?.textContent?.trim() ??
        null,
      columnId
    )
  try {
    await browser.waitUntil(async () => (await shown()) === count, { timeout: 15000 })
  } catch {
    // Built here rather than as `timeoutMsg`, which is a plain string evaluated before the first
    // poll and can therefore only ever report the state the step started in.
    throw new Error(
      `the "${columnName}" column holds ${JSON.stringify(await shown())} card(s), expected "${count}" — every column: ${JSON.stringify(await columnCounts())}`
    )
  }
})

Then(/^the card "([^"]*)" is shown on the board$/, async (title: string) => {
  await browser.waitUntil(async () => (await cardTestId(title)) !== null, {
    timeout: 15000,
    timeoutMsg: `the card "${title}" is not on the board`,
  })
})

Then(
  /^the card "([^"]*)" is identified as "([^"]*)"$/,
  async (title: string, identifier: string) => {
    const testid = await cardTestIdOrThrow(title)
    const shown = await $(`[data-testid="${testid}"] [data-testid="board-card-identifier"]`)
    await expect(shown).toHaveText(identifier)
  }
)

Then(/^the sprint is read-only$/, async () => {
  await $('[data-testid="board-closed-banner"]').waitForDisplayed({ timeout: 15000 })
  // The close button is one of the actions a closed sprint drops entirely, rather than disabling.
  await expect($('[data-testid="board-close-sprint-button"]')).not.toBeExisting()
})

Then(/^the sprint report is shown$/, async () => {
  await $('[data-testid="sprint-summary"]').waitForDisplayed({ timeout: 15000 })
})

// ─── What the repository stores ────────────────────────────────────────────

Then(/^the repository stores (\d+) boards? in its own git history$/, async (count: string) => {
  await browser.waitUntil(async () => boardRefs().length === Number(count), {
    timeout: 15000,
    timeoutMsg: `expected ${count} board ref(s) under ${BOARD_REF_GLOB}, found ${boardRefs().length}`,
  })
})

Then(/^the board history records "([^"]*)"$/, async (subject: string) => {
  await browser.waitUntil(
    async () =>
      boardRefs().some((ref) =>
        git('log', '--format=%s', ref)
          .split('\n')
          .some((line) => line.trim() === subject)
      ),
    {
      timeout: 15000,
      timeoutMsg: `no board ref has a commit titled "${subject}"`,
    }
  )
})

Then(
  /^the card "([^"]*)" is stored in the "([^"]*)" column$/,
  async (title: string, columnName: string) => {
    // Named, not id'd: what a card blob holds is the column *id*, but a scenario (and the page
    // generated from it) should say the name that is on screen.
    const columnId = await columnIdByName(columnName)
    await browser.waitUntil(
      async () =>
        boardRefs().some((ref) =>
          storedCards(ref).some((card) => card.title === title && card.columnId === columnId)
        ),
      {
        timeout: 15000,
        timeoutMsg: `no board ref stores a card "${title}" in the "${columnName}" column`,
      }
    )
  }
)
