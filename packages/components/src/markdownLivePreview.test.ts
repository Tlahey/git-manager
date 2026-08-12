import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { markdownDecorations } from './markdownLivePreview'

/** `cursor` defaults to the very start, so the assertions are about a line nobody is editing. */
function state(doc: string, cursor = 0) {
  return EditorState.create({ doc, extensions: [markdown()], selection: { anchor: cursor } })
}

interface Decorated {
  text: string
  className?: string
}

function decorated(
  doc: string,
  cursor?: number
): { hidden: string[]; styled: Decorated[]; lines: string[] } {
  const editorState = state(doc, cursor)
  const set = markdownDecorations(editorState)
  const hidden: string[] = []
  const styled: Decorated[] = []
  const lines: string[] = []

  const iterator = set.iter()
  while (iterator.value) {
    const text = editorState.doc.sliceString(iterator.from, iterator.to)
    const className = iterator.value.spec.class as string | undefined
    // A line decoration is empty and carries a class; a hidden marker is empty of class instead.
    if (className && iterator.from === iterator.to) lines.push(className)
    else if (className) styled.push({ text, className })
    else hidden.push(text)
    iterator.next()
  }
  return { hidden, styled, lines }
}

/** The classes applied to a given fragment of the document. */
function classesOf(doc: string, text: string, cursor?: number): string[] {
  return decorated(doc, cursor)
    .styled.filter((entry) => entry.text === text)
    .map((entry) => entry.className ?? '')
}

describe('markdownDecorations', () => {
  it('styles a heading and hides its marker', () => {
    const { hidden } = decorated('para\n\n## Title')

    expect(classesOf('para\n\n## Title', '## Title')).toContain('cm-md-heading cm-md-h2')
    expect(hidden).toContain('## ')
  })

  it('hides the space after a heading marker, so the title is not indented by one', () => {
    const { hidden } = decorated('para\n\n## Title')

    expect(hidden).toContain('## ')
    expect(hidden).not.toContain('##')
  })

  it('marks the heading line itself, for what belongs to the block', () => {
    expect(decorated('para\n\n# Title').lines).toContain('cm-md-line-heading cm-md-line-h1')
    expect(decorated('para\n\n### Title').lines).toContain('cm-md-line-heading cm-md-line-h3')
  })

  it('styles bold and italic', () => {
    expect(classesOf('cursor\n\nsome **strong** text', '**strong**')).toContain('cm-md-strong')
    expect(classesOf('cursor\n\nsome _soft_ text', '_soft_')).toContain('cm-md-emphasis')
  })

  it('hides the emphasis markers of a line nobody is editing', () => {
    const { hidden } = decorated('cursor\n\nsome **strong** text')

    expect(hidden.filter((text) => text === '**')).toHaveLength(2)
  })

  it('brings the markers back on the line the caret is on', () => {
    const doc = 'cursor\n\nsome **strong** text'
    const { hidden } = decorated(doc, doc.indexOf('strong'))

    expect(hidden).not.toContain('**')
  })

  it('keeps the markers of every other line hidden meanwhile', () => {
    const doc = '**first**\n\n**second**'
    const { hidden } = decorated(doc, doc.indexOf('second'))

    expect(hidden.filter((text) => text === '**')).toHaveLength(2)
  })

  it('styles inline code and hides its backticks', () => {
    const doc = 'cursor\n\nrun `pnpm dev` now'

    expect(classesOf(doc, '`pnpm dev`')).toContain('cm-md-code')
    expect(decorated(doc).hidden).toContain('`')
  })

  it('leaves a link as its label alone, target and brackets hidden', () => {
    const doc = 'cursor\n\nsee [the docs](https://example.com)'
    const { hidden } = decorated(doc)

    expect(classesOf(doc, '[the docs](https://example.com)')).toContain('cm-md-link')
    expect(hidden).toEqual(expect.arrayContaining(['[', ']', '(', ')', 'https://example.com']))
  })

  it('never hides a bare autolink — the target is all there is to show', () => {
    const doc = 'cursor\n\nsee <https://example.com>'

    expect(decorated(doc).hidden).not.toContain('https://example.com')
  })

  it('leaves a list bullet visible — the bullet is the rendering', () => {
    const { hidden } = decorated('cursor\n\n- an item\n- another')

    expect(hidden).not.toContain('-')
  })

  it('leaves a quote marker visible', () => {
    const { hidden } = decorated('cursor\n\n> quoted')

    expect(hidden).not.toContain('>')
  })

  it('marks every line of a quote, so it reads like the rendered one', () => {
    const { lines } = decorated('cursor\n\n> first\n> second')

    expect(lines.filter((className) => className === 'cm-md-line-quote')).toHaveLength(2)
  })

  it('decorates nothing in a plain paragraph', () => {
    const { hidden, styled } = decorated('cursor\n\njust some prose')

    expect(hidden).toHaveLength(0)
    expect(styled).toHaveLength(0)
  })
})
