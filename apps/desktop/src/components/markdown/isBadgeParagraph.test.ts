import { describe, expect, it } from 'vitest'
import { isBadgeParagraph, type MarkdownNodeLike } from './isBadgeParagraph'

const text = (value: string): MarkdownNodeLike => ({ type: 'text', value })
const el = (tagName: string, children: MarkdownNodeLike[] = []): MarkdownNodeLike => ({
  type: 'element',
  tagName,
  children,
})
const img = () => el('img')
const p = (children: MarkdownNodeLike[]): MarkdownNodeLike => el('p', children)

describe('isBadgeParagraph', () => {
  it('accepts a row of bare images separated by whitespace', () => {
    expect(isBadgeParagraph(p([img(), text(' '), img()]))).toBe(true)
  })

  it('accepts images wrapped in links, the shields.io README header shape', () => {
    expect(isBadgeParagraph(p([el('a', [img()]), text('\n'), el('a', [img()])]))).toBe(true)
  })

  it('accepts a <picture> and a hard break between badges', () => {
    expect(isBadgeParagraph(p([el('picture', [el('source'), img()]), el('br'), img()]))).toBe(true)
  })

  it('rejects a paragraph that mixes prose with an image', () => {
    expect(isBadgeParagraph(p([text('Issues'), el('br'), img()]))).toBe(false)
  })

  it('rejects a link whose label is text, even next to a badge', () => {
    expect(isBadgeParagraph(p([img(), text(' '), el('a', [text('0 New issues')])]))).toBe(false)
  })

  it('rejects a paragraph with no image at all', () => {
    expect(isBadgeParagraph(p([el('a', [text('See details')])]))).toBe(false)
  })

  it('rejects an unknown wrapper element even when it only holds badges', () => {
    expect(isBadgeParagraph(p([el('code', [img()])]))).toBe(false)
  })

  it('returns false for a missing node', () => {
    expect(isBadgeParagraph(undefined)).toBe(false)
  })

  it('returns false for an empty paragraph', () => {
    expect(isBadgeParagraph(p([]))).toBe(false)
  })
})
