import { describe, it, expect } from 'vitest'
import { createElement, isValidElement, Children, type ReactNode } from 'react'
import { parseMarkdownAlert } from './markdownAlert'

/** What react-markdown hands a blockquote: a `<p>` element whose text still carries the marker. */
function quote(...paragraphs: ReactNode[][]) {
  return paragraphs.map((children, index) => createElement('p', { key: index }, ...children))
}

/** The text of the parsed content's first paragraph. */
function firstParagraphText(content: ReactNode): string {
  const [first] = Children.toArray(content)
  if (!isValidElement<{ children?: ReactNode }>(first)) return ''
  return Children.toArray(first.props.children)
    .filter((c) => typeof c === 'string')
    .join('')
}

describe('parseMarkdownAlert', () => {
  it('recognises every GitHub alert kind', () => {
    for (const kind of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
      expect(parseMarkdownAlert(quote([`[!${kind}]\nbody`]))?.kind).toBe(kind.toLowerCase())
    }
  })

  it('strips the marker from the content it returns', () => {
    const alert = parseMarkdownAlert(quote(['[!NOTE]\nWatch out.']))

    expect(firstParagraphText(alert?.content)).toBe('Watch out.')
  })

  it('keeps the rest of the paragraph intact, elements included', () => {
    const link = createElement('a', { key: 'l', href: '#' }, 'the docs')
    const alert = parseMarkdownAlert(quote(['[!TIP]\nSee ', link]))

    expect(Children.toArray(alert?.content)).toHaveLength(1)
    expect(firstParagraphText(alert?.content)).toBe('See ')
  })

  it('keeps the following paragraphs of a multi-paragraph alert', () => {
    const alert = parseMarkdownAlert(quote(['[!WARNING]\nFirst.'], ['Second.']))

    expect(Children.toArray(alert?.content)).toHaveLength(2)
  })

  it('drops the empty paragraph of a marker-only alert', () => {
    const alert = parseMarkdownAlert(quote(['[!NOTE]']))

    expect(Children.toArray(alert?.content)).toHaveLength(0)
  })

  it('looks past the newline text nodes react-markdown leaves between elements', () => {
    const alert = parseMarkdownAlert(['\n', ...quote(['[!TIP]\nUse a worktree.']), '\n'])

    expect(alert?.kind).toBe('tip')
    expect(firstParagraphText(alert?.content)).toBe('Use a worktree.')
  })

  it('leaves an ordinary quote alone', () => {
    expect(parseMarkdownAlert(quote(['Just a quotation.']))).toBeNull()
  })

  it('ignores an unknown marker', () => {
    expect(parseMarkdownAlert(quote(['[!SHOUT]\nbody']))).toBeNull()
  })

  it('ignores a marker that is not at the very start', () => {
    expect(parseMarkdownAlert(quote(['See [!NOTE]\nbody']))).toBeNull()
  })
})
