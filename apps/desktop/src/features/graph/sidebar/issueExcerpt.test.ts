import { describe, it, expect } from 'vitest'
import { EXCERPT_LENGTH, issueExcerpt } from './issueExcerpt'

describe('issueExcerpt — empty input', () => {
  it('returns an empty string for a missing or blank body', () => {
    expect(issueExcerpt(undefined)).toBe('')
    expect(issueExcerpt('')).toBe('')
    expect(issueExcerpt('   \n\n  ')).toBe('')
  })
})

describe('issueExcerpt — markdown stripping', () => {
  it('keeps plain prose as-is', () => {
    expect(issueExcerpt('The sidebar loses its scroll position.')).toBe(
      'The sidebar loses its scroll position.'
    )
  })

  it('drops a fenced code block whole rather than truncating it', () => {
    const body = 'Before\n\n```ts\nconst x = 1\n```\n\nAfter'
    expect(issueExcerpt(body)).toBe('Before After')
  })

  // A body cut mid-block has no recoverable prose after the fence.
  it('drops everything after an unterminated fence', () => {
    expect(issueExcerpt('Steps\n\n```\nstack trace line')).toBe('Steps')
  })

  it('drops tilde-fenced blocks too', () => {
    expect(issueExcerpt('Before\n\n~~~\ncode\n~~~\n\nAfter')).toBe('Before After')
  })

  // Issue templates hide their instructions in HTML comments.
  it('drops HTML comments', () => {
    expect(issueExcerpt('<!-- Please fill this in -->\nReal content')).toBe('Real content')
  })

  it('drops raw HTML tags but keeps the text inside them', () => {
    expect(issueExcerpt('<details><summary>More</summary>Body text</details>')).toBe(
      'More Body text'
    )
  })

  it("keeps a link's text and drops its target", () => {
    expect(issueExcerpt('See [the docs](https://example.com/very/long/url) for details')).toBe(
      'See the docs for details'
    )
  })

  it('drops images entirely, target and alt text alike', () => {
    expect(
      issueExcerpt('Screenshot: ![a very wide screenshot](https://img.example/x.png) done')
    ).toBe('Screenshot: done')
  })

  it('strips heading, quote, bullet and numbered-list markers', () => {
    expect(issueExcerpt('# Title\n\n> quoted\n\n- one\n* two\n1. three')).toBe(
      'Title quoted one two three'
    )
  })

  it('drops table rows and horizontal rules', () => {
    expect(issueExcerpt('Intro\n\n| a | b |\n| - | - |\n\n---\n\nOutro')).toBe('Intro Outro')
  })

  it('keeps emphasised and inline-code text without its markers', () => {
    expect(issueExcerpt('The **bold** and `code` and _italic_ bits')).toBe(
      'The bold and code and italic bits'
    )
  })

  it('collapses newlines and runs of whitespace into single spaces', () => {
    expect(issueExcerpt('One\n\n\nTwo   \t Three')).toBe('One Two Three')
  })
})

describe('issueExcerpt — truncation', () => {
  it('leaves a body shorter than the limit untouched, with no ellipsis', () => {
    const body = 'a'.repeat(EXCERPT_LENGTH)
    expect(issueExcerpt(body)).toBe(body)
  })

  it('truncates a longer body and marks it with an ellipsis', () => {
    const excerpt = issueExcerpt('word '.repeat(200))
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1)
  })

  it('cuts on a word boundary rather than mid-word', () => {
    const excerpt = issueExcerpt('lorem ipsum '.repeat(50), 20)
    expect(excerpt).toBe('lorem ipsum lorem…')
  })

  // A single unbroken token has no boundary to cut on — a hard cut beats returning nothing.
  it('falls back to a hard cut when there is no nearby space', () => {
    const excerpt = issueExcerpt('x'.repeat(100), 20)
    expect(excerpt).toBe(`${'x'.repeat(20)}…`)
  })

  it('honours an explicit limit', () => {
    expect(issueExcerpt('a'.repeat(50), 10)).toBe(`${'a'.repeat(10)}…`)
  })

  // Stripping runs first, so a body that is mostly markup stays under the limit.
  it('measures the stripped text, not the raw markdown', () => {
    const body = `[link](${'https://example.com/'.repeat(30)}) short`
    expect(issueExcerpt(body)).toBe('link short')
  })
})
