import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { markdownDecorations } from './markdownDecorations'
import {
  AlertTitleWidget,
  DiagramWidget,
  ImageWidget,
  RuleWidget,
  TableWidget,
  TaskCheckboxWidget,
} from './markdownWidgets'

/** `cursor` defaults to the very start, so the assertions are about a line nobody is editing. */
function state(doc: string, cursor = 0) {
  const editorState = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
    selection: { anchor: cursor },
  })
  // A bare state created via `EditorState.create` (no `EditorView`) never gets the idle-callback
  // background parsing a real editor would give it, so `syntaxTree()` inside `markdownDecorations`
  // can see a tree that Lezer's bounded parse budget cut off before finishing — on a loaded CI
  // runner this was intermittently incomplete, failing a different assertion on every retry.
  // Force the parse to completion once here so every test sees the same, fully-parsed tree.
  ensureSyntaxTree(editorState, editorState.doc.length, 10000)
  return editorState
}

interface Decorated {
  text: string
  className?: string
}

function decorated(
  doc: string,
  cursor?: number,
  options?: Parameters<typeof markdownDecorations>[2]
): { hidden: string[]; styled: Decorated[]; lines: string[]; widgets: unknown[] } {
  const editorState = state(doc, cursor)
  const set = markdownDecorations(editorState, undefined, options)
  const hidden: string[] = []
  const styled: Decorated[] = []
  const lines: string[] = []
  const widgets: unknown[] = []

  const iterator = set.iter()
  while (iterator.value) {
    const text = editorState.doc.sliceString(iterator.from, iterator.to)
    const className = iterator.value.spec.class as string | undefined
    const widget = iterator.value.spec.widget as unknown
    // A line decoration is empty and carries a class; a replaced range carries a widget, or
    // nothing at all when it is simply hidden.
    if (widget) widgets.push(widget)
    else if (className && iterator.from === iterator.to) lines.push(className)
    else if (className) styled.push({ text, className })
    else hidden.push(text)
    iterator.next()
  }
  return { hidden, styled, lines, widgets }
}

/** Images are only drawn for a caller that knows how to resolve their paths. */
const withImages = { resolveImageSrc: (src: string) => `resolved:${src}` }

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

  it('draws a task marker as a checkbox, ticked or not', () => {
    const { widgets } = decorated('cursor\n\n- [x] done\n- [ ] todo')
    const boxes = widgets.filter((widget) => widget instanceof TaskCheckboxWidget)

    expect(boxes).toHaveLength(2)
    expect((boxes[0] as TaskCheckboxWidget).checked).toBe(true)
    expect((boxes[1] as TaskCheckboxWidget).checked).toBe(false)
  })

  it('keeps the checkbox on the line being edited — ticking it is the whole gesture', () => {
    const doc = '- [ ] todo'
    const { widgets } = decorated(doc, doc.indexOf('todo'))

    expect(widgets.some((widget) => widget instanceof TaskCheckboxWidget)).toBe(true)
  })

  it("draws an image, through the caller's own path resolution", () => {
    const { widgets } = decorated('cursor\n\n![shot](a.png)', 0, withImages)
    const image = widgets.find((widget) => widget instanceof ImageWidget) as ImageWidget

    expect(image.src).toBe('resolved:a.png')
    expect(image.alt).toBe('shot')
  })

  it('shows an image as source while its line is being edited', () => {
    const doc = 'cursor\n\n![shot](a.png)'
    const { widgets } = decorated(doc, doc.indexOf('shot'), withImages)

    expect(widgets.some((widget) => widget instanceof ImageWidget)).toBe(false)
  })

  it('leaves an image alone when nobody can resolve its path', () => {
    const { widgets } = decorated('cursor\n\n![shot](a.png)')

    expect(widgets.some((widget) => widget instanceof ImageWidget)).toBe(false)
  })

  it('draws a horizontal rule', () => {
    const { widgets } = decorated('cursor\n\n---\n\nafter')

    expect(widgets.some((widget) => widget instanceof RuleWidget)).toBe(true)
  })

  it('tints every line of a fenced code block', () => {
    const { lines } = decorated('cursor\n\n```ts\nconst a = 1\n```')

    expect(lines.filter((className) => className === 'cm-md-line-fence')).toHaveLength(3)
  })

  it('turns an alert into a callout, title and tint', () => {
    const { widgets, lines } = decorated('cursor\n\n> [!WARNING]\n> careful')
    const title = widgets.find((widget) => widget instanceof AlertTitleWidget) as AlertTitleWidget

    expect(title.kind).toBe('warning')
    expect(lines.filter((c) => c === 'cm-md-line-alert cm-md-line-alert-warning')).toHaveLength(2)
  })

  it('shows the alert marker again when its line is being edited', () => {
    const doc = '> [!NOTE]\n> careful'
    const { widgets } = decorated(doc, 2)

    expect(widgets.some((widget) => widget instanceof AlertTitleWidget)).toBe(false)
  })

  it('leaves an ordinary quote a quote', () => {
    const { lines, widgets } = decorated('cursor\n\n> just quoted')

    expect(lines).toContain('cm-md-line-quote')
    expect(widgets.some((widget) => widget instanceof AlertTitleWidget)).toBe(false)
  })

  it('draws a table', () => {
    const { widgets } = decorated('cursor\n\n| a | b |\n| --- | --- |\n| 1 | 2 |')
    const table = widgets.find((widget) => widget instanceof TableWidget) as TableWidget

    expect(table.source).toContain('| a | b |')
  })

  it('gives the table back as source while it is being edited', () => {
    const doc = 'cursor\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'
    const { widgets, lines } = decorated(doc, doc.indexOf('| 1'))

    expect(widgets.some((widget) => widget instanceof TableWidget)).toBe(false)
    expect(lines.filter((c) => c === 'cm-md-line-table').length).toBeGreaterThan(0)
  })

  it('draws a mermaid fence as a diagram', () => {
    const { widgets } = decorated('cursor\n\n```mermaid\nflowchart TD\n  A --> B\n```', 0, {
      renderDiagram: async () => '<svg />',
    })
    const diagram = widgets.find((widget) => widget instanceof DiagramWidget) as DiagramWidget

    expect(diagram.code).toBe('flowchart TD\n  A --> B')
  })

  it('leaves an ordinary fence as code', () => {
    const { widgets, lines } = decorated('cursor\n\n```ts\nconst a = 1\n```', 0, {
      renderDiagram: async () => '<svg />',
    })

    expect(widgets.some((widget) => widget instanceof DiagramWidget)).toBe(false)
    expect(lines).toContain('cm-md-line-fence')
  })

  it('gives a diagram back as source while it is being edited', () => {
    const doc = 'cursor\n\n```mermaid\nflowchart TD\n```'
    const { widgets } = decorated(doc, doc.indexOf('flowchart'), {
      renderDiagram: async () => '<svg />',
    })

    expect(widgets.some((widget) => widget instanceof DiagramWidget)).toBe(false)
  })

  it('leaves diagrams as source when nobody can render them', () => {
    const { widgets } = decorated('cursor\n\n```mermaid\nflowchart TD\n```')

    expect(widgets.some((widget) => widget instanceof DiagramWidget)).toBe(false)
  })

  it('decorates nothing in a plain paragraph', () => {
    const { hidden, styled } = decorated('cursor\n\njust some prose')

    expect(hidden).toHaveLength(0)
    expect(styled).toHaveLength(0)
  })
})
