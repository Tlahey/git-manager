/**
 * The Definition of Done, seen as a list of checkbox items instead of raw markdown.
 *
 * The card still *stores* a markdown task list — that is what makes it a native, tickable checklist
 * in a GitHub issue body and what both backends round-trip. This module is the bridge: it reads that
 * string into rows a checklist editor can manipulate, and writes them back.
 *
 * Lines that aren't checkboxes are **kept verbatim, in place**. A DOD written before this editor
 * existed may hold a heading or a paragraph, and an editor that silently dropped everything it
 * didn't understand would destroy the user's text the first time they ticked a box.
 */

export interface DodItem {
  /** Index into the document's lines — stable for the lifetime of one parse, which is all the
   * editor needs to address a row. */
  index: number
  text: string
  done: boolean
}

/** `- [ ] text` / `* [x] text` / `+ [X] text`, any indent — GFM's own checkbox syntax. */
const CHECKBOX_LINE = /^(\s*)([-*+])\s+\[([ xX])\]\s?(.*)$/

export function parseDodItems(dod: string): DodItem[] {
  const items: DodItem[] = []
  dod.split('\n').forEach((line, index) => {
    const match = line.match(CHECKBOX_LINE)
    if (match) items.push({ index, text: match[4].trim(), done: match[3].toLowerCase() === 'x' })
  })
  return items
}

function formatItem(text: string, done: boolean): string {
  return `- [${done ? 'x' : ' '}] ${text}`
}

/** Replaces one checkbox line, leaving every other line — checkbox or not — untouched. */
function replaceLine(dod: string, index: number, next: string | null): string {
  const lines = dod.split('\n')
  if (index < 0 || index >= lines.length) return dod
  if (next === null) lines.splice(index, 1)
  else lines[index] = next
  return lines.join('\n')
}

export function setItemDone(dod: string, index: number, done: boolean): string {
  const match = dod.split('\n')[index]?.match(CHECKBOX_LINE)
  if (!match) return dod
  return replaceLine(dod, index, `${match[1]}${match[2]} [${done ? 'x' : ' '}] ${match[4]}`)
}

export function setItemText(dod: string, index: number, text: string): string {
  const match = dod.split('\n')[index]?.match(CHECKBOX_LINE)
  if (!match) return dod
  return replaceLine(dod, index, `${match[1]}${match[2]} [${match[3]}] ${text}`)
}

export function removeItem(dod: string, index: number): string {
  const match = dod.split('\n')[index]?.match(CHECKBOX_LINE)
  if (!match) return dod
  return replaceLine(dod, index, null)
}

/**
 * Appends an item after the last checkbox, not at the end of the document — so a DOD that ends with
 * a closing note keeps that note last.
 */
export function addItem(dod: string, text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return dod
  if (!dod.trim()) return formatItem(trimmed, false)

  const lines = dod.split('\n')
  let lastCheckbox = -1
  lines.forEach((line, index) => {
    if (CHECKBOX_LINE.test(line)) lastCheckbox = index
  })

  const at = lastCheckbox === -1 ? lines.length : lastCheckbox + 1
  lines.splice(at, 0, formatItem(trimmed, false))
  return lines.join('\n')
}
