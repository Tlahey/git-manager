import { describe, it, expect } from 'vitest'
import { markdownToPlainText } from './markdownPlainText'

describe('markdownToPlainText', () => {
  it('returns an empty string for nothing to strip', () => {
    expect(markdownToPlainText(undefined)).toBe('')
    expect(markdownToPlainText('')).toBe('')
    expect(markdownToPlainText('   \n\n  ')).toBe('')
  })

  it('keeps prose as it was written', () => {
    expect(markdownToPlainText('Needs a fresh coat of paint')).toBe('Needs a fresh coat of paint')
  })

  it('drops inline emphasis and code markers, keeping their content', () => {
    expect(markdownToPlainText('The **header** uses `useState` and is ~~broken~~')).toBe(
      'The header uses useState and is broken'
    )
  })

  it('drops headings, bullets and quote markers', () => {
    expect(markdownToPlainText('## Context\n\n- one\n- two\n\n> a quote')).toBe(
      'Context one two a quote'
    )
  })

  it('drops a task list’s checkboxes', () => {
    expect(markdownToPlainText('- [x] done\n- [ ] not yet')).toBe('done not yet')
  })

  /** A fenced block is dropped whole rather than truncated: half a stack trace in a two-line
   * preview is noise, and a cut fence renders as garbage. */
  it('drops a fenced code block whole, even an unterminated one', () => {
    expect(markdownToPlainText('Before\n\n```ts\nconst a = 1\n```\n\nAfter')).toBe('Before After')
    expect(markdownToPlainText('Before\n\n```ts\nconst a = 1')).toBe('Before')
  })

  it('keeps a link’s text and drops an image entirely', () => {
    expect(markdownToPlainText('See [the spec](https://example.test/a)')).toBe('See the spec')
    expect(markdownToPlainText('![screenshot](shot.png) broke')).toBe('broke')
  })

  it('drops raw HTML and the card’s own hidden metadata marker', () => {
    expect(
      markdownToPlainText('Ship it<br/>\n\n<!-- git-manager:meta {"dueDate":"2026-01-01"} -->')
    ).toBe('Ship it')
  })

  it('drops a table and a horizontal rule', () => {
    expect(markdownToPlainText('Before\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---\n\nAfter')).toBe(
      'Before After'
    )
  })
})
