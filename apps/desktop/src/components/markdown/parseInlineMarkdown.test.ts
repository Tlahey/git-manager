import { describe, it, expect } from 'vitest'
import { parseInlineMarkdown, type InlineMarkdownNode } from './parseInlineMarkdown'

/** The text a renderer would end up showing, markers gone. */
function flatten(nodes: InlineMarkdownNode[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text' || node.kind === 'code' ? node.text : flatten(node.children)
    )
    .join('')
}

describe('parseInlineMarkdown', () => {
  it('leaves plain text alone', () => {
    expect(parseInlineMarkdown('Fix the header')).toEqual([
      { kind: 'text', text: 'Fix the header' },
    ])
  })

  it('returns nothing for an empty string', () => {
    expect(parseInlineMarkdown('')).toEqual([])
  })

  it('reads bold, italic and strikethrough', () => {
    expect(parseInlineMarkdown('**a**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'a' }] },
    ])
    expect(parseInlineMarkdown('_a_')).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'a' }] },
    ])
    expect(parseInlineMarkdown('~~a~~')).toEqual([
      { kind: 'del', children: [{ kind: 'text', text: 'a' }] },
    ])
  })

  it('reads inline code as its content, unparsed', () => {
    expect(parseInlineMarkdown('Fix `use_state**` crash')).toEqual([
      { kind: 'text', text: 'Fix ' },
      { kind: 'code', text: 'use_state**' },
      { kind: 'text', text: ' crash' },
    ])
  })

  it('nests emphasis inside emphasis', () => {
    expect(parseInlineMarkdown('*a **b** c*')).toEqual([
      {
        kind: 'em',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
          { kind: 'text', text: ' c' },
        ],
      },
    ])
  })

  /** A leftover asterisk on screen is the exact thing this parser exists to remove, so a run of
   * three is taken as one triple rather than a pair with an orphan beside it. */
  it('takes ***both*** as bold and italic together', () => {
    expect(parseInlineMarkdown('***a***')).toEqual([
      { kind: 'strong', children: [{ kind: 'em', children: [{ kind: 'text', text: 'a' }] }] },
    ])
  })

  it('keeps a link’s text and drops its target', () => {
    expect(parseInlineMarkdown('See [the **spec**](https://example.test/a)')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'text', text: 'the ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'spec' }] },
    ])
  })

  it('shows an image as its alt text', () => {
    expect(flatten(parseInlineMarkdown('Broken ![the toolbar](shot.png) again'))).toBe(
      'Broken the toolbar again'
    )
  })

  it('honours a backslash escape', () => {
    expect(parseInlineMarkdown('literal \\*stars\\*')).toEqual([
      { kind: 'text', text: 'literal *stars*' },
    ])
  })
})

describe('parseInlineMarkdown — what it refuses to treat as markup', () => {
  it('leaves an unclosed marker as written', () => {
    expect(parseInlineMarkdown('**almost bold')).toEqual([{ kind: 'text', text: '**almost bold' }])
    expect(parseInlineMarkdown('a `half fence')).toEqual([{ kind: 'text', text: 'a `half fence' }])
  })

  it('leaves arithmetic alone', () => {
    expect(parseInlineMarkdown('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }])
  })

  it('leaves an identifier’s underscores alone', () => {
    expect(parseInlineMarkdown('rename snake_case_name')).toEqual([
      { kind: 'text', text: 'rename snake_case_name' },
    ])
  })

  /** The closer search has to step over code spans, or the asterisk inside one closes the pair. */
  it('does not close an emphasis inside a code span', () => {
    expect(parseInlineMarkdown('*em* and `2*3`')).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'em' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: '2*3' },
    ])
  })

  it('leaves a bracket that is not a link', () => {
    expect(parseInlineMarkdown('[WIP] ship it')).toEqual([{ kind: 'text', text: '[WIP] ship it' }])
  })
})
