import { execFileSync } from 'node:child_process'
import { browser, $ } from '@wdio/globals'
import { getActiveRepoPath } from './activeRepo'

/**
 * Shared helpers for the Kanban board features (`board.feature`, `board-cards.feature`).
 *
 * Two conventions run through everything here, both forced by the feature itself rather than chosen:
 *
 * **Nothing on a board has a stable id.** Board and card ids are generated per write
 * (`git_board.rs`'s `generate_id`, seeded on a nanosecond timestamp), so `board-card-<id>` and
 * `board-sidebar-item-<id>` cannot be written into a `.feature` file. Every step therefore names
 * things the way a reader would — by title, by column name, by sprint name — and resolves the testid
 * in the page. The **columns** are the exception (`todo`/`in-progress`/`done` are literal defaults,
 * see `boardDefaults.ts`), but they are resolved by name too, so a scenario keeps reading as English
 * and a renamed column doesn't need a step edited.
 *
 * **The assertions end on disk.** A local board is stored on a hidden ref per board
 * (`refs/git-manager/board/<id>/state`), one commit per mutation — so "the card moved" is checkable
 * as a real `git show` of the card's blob rather than as a DOM state that a stale render could also
 * produce. The UI assertions say what the user sees; these say what was written.
 *
 * This file exists because there are now two step files over the same surface: the second one
 * needed every helper the first had, and a copy is exactly what `COVERAGE.md` says not to write a
 * ninth of.
 */

export const BOARD_REF_GLOB = 'refs/git-manager/board/'

/** A card blob as it sits in the board's tree, in the JSON shape `models.rs` serializes. */
export interface StoredCard {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string
  prefix: string
  number: number
  kind: string
  dod: string
  priority: string
  tagIds: string[]
  links: { kind: string; targetBoardId: string; targetCardId: string }[]
  comments: {
    id: string
    author: string
    body: string
    createdAt: string
    /** Set on a reply — the comment it answers. Absent on a top-level comment, which is what makes
     * "this reply was stored under that comment" checkable on disk rather than only in the DOM. */
    parentCommentId?: string
  }[]
  assignee?: string
  dueDate?: string
  blockedReason?: string
  archivedAt?: string
  /** The branch created for this card from the record's own branch section. */
  linkedBranch?: string
  /** The worktree created for that branch, if one was. */
  linkedWorktreePath?: string
}

/** `board.json`, same story. */
export interface StoredBoard {
  id: string
  name: string
  columns: { id: string; name: string; order: number; isDone?: boolean }[]
  tags: { id: string; name: string; color: string }[]
  cardPrefixes: string[]
  nextCardNumbers: Record<string, number>
  dodTemplate: string
  closedAt?: string
}

export function git(...args: string[]): string {
  return execFileSync('git', ['-C', getActiveRepoPath(), ...args], { encoding: 'utf8' })
}

/** Every board ref in the fixture repo, one per board that exists. */
export function boardRefs(): string[] {
  return git('for-each-ref', '--format=%(refname)', BOARD_REF_GLOB)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** The stored `board.json` on `ref`. */
export function storedBoard(ref: string): StoredBoard {
  return JSON.parse(git('show', `${ref}:board.json`)) as StoredBoard
}

/**
 * The ref of the board called `name`.
 *
 * By name because that is the only handle a scenario has: the id is generated per write. Throws
 * rather than returning `null`, since every caller is an assertion that would only report "not
 * found" one line later and with less to say.
 */
export function boardRefNamed(name: string): string {
  const refs = boardRefs()
  const hit = refs.find((ref) => storedBoard(ref).name === name)
  if (!hit) {
    throw new Error(
      `no board named "${name}" is stored in the repository — boards: ${JSON.stringify(
        refs.map((ref) => storedBoard(ref).name)
      )}`
    )
  }
  return hit
}

/** Every card blob stored on `ref`, parsed. */
export function storedCards(ref: string): StoredCard[] {
  // `ls-tree` on a board with no card yet fails on the missing `cards/` path rather than listing
  // nothing — a board is created before its first card, so that is an ordinary state here.
  const listing = (() => {
    try {
      return git('ls-tree', '--name-only', `${ref}:cards`)
    } catch {
      return ''
    }
  })()
  return listing
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => JSON.parse(git('show', `${ref}:cards/${file}`)) as StoredCard)
}

/** Every card stored on any board of the repo. */
export function allStoredCards(): StoredCard[] {
  return boardRefs().flatMap((ref) => storedCards(ref))
}

/**
 * The stored card titled `title`, wherever it lives.
 *
 * Returns `null` when there is none, because half the assertions built on this are about a card
 * that should *not* be there.
 */
export function storedCardTitled(title: string): StoredCard | null {
  return allStoredCards().find((card) => card.title === title) ?? null
}

/** Same, but failing with the titles that *are* stored — the diagnostic worth having. */
export function storedCardTitledOrThrow(title: string): StoredCard {
  const card = storedCardTitled(title)
  if (!card) {
    throw new Error(
      `no card titled "${title}" is stored in the repository — stored: ${JSON.stringify(
        allStoredCards().map((c) => c.title)
      )}`
    )
  }
  return card
}

/**
 * The name of the board currently on screen, read off the sidebar row marked as the current one.
 *
 * The board list is a standing panel now rather than a popover picker (`BoardSidebar`), so "which
 * board am I looking at" is answered without opening anything — `aria-current` is what the row sets,
 * and it is the same fact the page renders from.
 */
export async function activeBoardName(): Promise<string> {
  return (
    (await browser.execute(() => {
      const row = document.querySelector('[data-testid^="board-sidebar-item-"][aria-current]')
      return row?.textContent ?? ''
    })) ?? ''
  )
}

/**
 * Resolves a column's testid suffix from the name shown in its header.
 *
 * The label is read as "the header's text, minus the count element's" rather than through a class
 * selector: the header holds only the collapse chevron (an svg), an optional done tick (an svg), the
 * name and the count, so removing the one piece of text that isn't the name leaves the name.
 */
export function findColumnId(name: string): Promise<string | null> {
  return browser.execute((wanted: string) => {
    const all = Array.from(document.querySelectorAll('[data-testid^="board-column-"]'))
    const roots = all.filter((el) => !all.some((other) => other !== el && other.contains(el)))
    for (const root of roots) {
      const header = root.firstElementChild
      if (!header) continue
      const count = header.querySelector('[data-testid$="-count"]')
      let label = header.textContent ?? ''
      if (count) label = label.slice(0, label.length - (count.textContent ?? '').length)
      if (label.trim().toLowerCase() === wanted.trim().toLowerCase()) {
        return (root.getAttribute('data-testid') ?? '').replace('board-column-', '')
      }
    }
    return null
  }, name)
}

/** Polls, because the columns only mount once the board's cards have loaded — a step running right
 * after a board is created would otherwise race the spinner `BoardPage` shows in the meantime. */
export async function columnIdByName(name: string): Promise<string> {
  let id: string | null = null
  await browser.waitUntil(
    async () => {
      id = await findColumnId(name)
      return id !== null
    },
    { timeout: 15000, timeoutMsg: `no column named "${name}" on the board` }
  )
  return id!
}

/**
 * The `data-testid` of the card face whose text contains `title`, or `null`.
 *
 * Scoped to the columns so the query can stay a prefix match: `board-card-` also prefixes the card
 * *dialog* and half a dozen of the card face's own children, but the dialog renders in a portal on
 * `document.body` and the children are, by definition, inside the root this returns.
 */
export function cardTestId(title: string): Promise<string | null> {
  return browser.execute((wanted: string) => {
    const all = Array.from(
      document.querySelectorAll('[data-testid^="board-column-"] [data-testid^="board-card-"]')
    )
    const roots = all.filter((el) => !all.some((other) => other !== el && other.contains(el)))
    const hit = roots.find((el) => (el.textContent ?? '').includes(wanted))
    return hit ? hit.getAttribute('data-testid') : null
  }, title)
}

export async function cardTestIdOrThrow(title: string): Promise<string> {
  const testid = await cardTestId(title)
  if (!testid) throw new Error(`no card titled "${title}" is on the board`)
  return testid
}

/**
 * Closes whichever dialog `testid` names.
 *
 * `Escape` rather than the `DialogContent` close button, which carries no testid — and re-pressed
 * while the dialog is still up, for the reason README.md gives about a dispatched click sometimes
 * landing twice: a key that lands zero times looks exactly the same, and the step after this one
 * would then fail on the board being covered rather than on anything real. A stray extra Escape is
 * harmless here (`useKeyboardShortcuts` only acts on it to close the settings screen).
 */
export async function closeDialog(testid: string): Promise<void> {
  const gone = () =>
    browser.execute(
      (id: string) => document.querySelector(`[data-testid="${id}"]`) === null,
      testid
    )
  for (let attempt = 0; attempt < 3; attempt++) {
    await browser.keys('Escape')
    const closed = await browser
      .waitUntil(gone, { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (closed) return
  }
  throw new Error(`the "${testid}" dialog never closed`)
}

/**
 * Switches a `MarkdownEditorFrame` to its raw "code" tab so `testid`'s field (hidden behind
 * `class="hidden"` while the frame defaults to "rich") is actually there to type into.
 *
 * Scoped to the frame that owns `testid` rather than a bare `$('[data-testid="markdown-tab-code"]')`,
 * since a card panel can have more than one editor mounted at once — the description and the comment
 * box are both markdown fields, and the record shows them together.
 */
export async function switchToRawMarkdown(testid: string): Promise<void> {
  await browser.execute((id: string) => {
    const field = document.querySelector(`[data-testid="${id}"]`)
    const frame = field?.closest('[data-testid="markdown-editor-frame"]')
    const codeTab = frame?.querySelector('[data-testid="markdown-tab-code"]') as HTMLElement | null
    codeTab?.click()
  }, testid)
}

/** Opens a card by title and waits for the record view (not the create form) to be up. */
export async function openCard(title: string): Promise<void> {
  const testid = await cardTestIdOrThrow(title)
  await $(`[data-testid="${testid}"]`).click()
  await $('[data-testid="card-meta-sidebar"]').waitForDisplayed({ timeout: 10000 })
}

/** Every column's header count, by testid — the diagnostic the count assertion reports on failure. */
export function columnCounts(): Promise<Record<string, string>> {
  return browser.execute(() => {
    const counts: Record<string, string> = {}
    for (const el of Array.from(document.querySelectorAll('[data-testid$="-count"]'))) {
      const id = el.getAttribute('data-testid') ?? ''
      if (id.startsWith('board-column-')) counts[id] = (el.textContent ?? '').trim()
    }
    return counts
  })
}
