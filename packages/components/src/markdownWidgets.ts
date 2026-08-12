import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { parseMarkdownTable } from './markdownTable'

/**
 * The pieces of markdown that are *drawn* rather than styled: an image, a task checkbox, a rule.
 *
 * A widget replaces its own source text, which is why each one carries the range it stands for —
 * clicking a checkbox has to know which `[ ]` to rewrite. The decorations are rebuilt on every
 * document change, so a widget never outlives the positions it was built with.
 */

/** A task list's `[ ]` / `[x]`, as the checkbox it means. */
export class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly checked: boolean
  ) {
    super()
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.from === this.from && other.to === this.to && other.checked === this.checked
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-md-task'
    // Ticking a box shouldn't move the caret out of whatever sentence is being written.
    input.addEventListener('mousedown', (event) => event.preventDefault())
    input.addEventListener('click', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
      })
    })
    return input
  }

  /** The widget answers its own clicks; CodeMirror must not read them as editing gestures. */
  ignoreEvent(): boolean {
    return true
  }
}

/** An `![alt](src)`, as the image. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(): HTMLElement {
    const image = document.createElement('img')
    image.src = this.src
    image.alt = this.alt
    image.className = 'cm-md-image'
    image.loading = 'lazy'
    return image
  }
}

/** A `---`, as the rule it draws. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    // Every rule is the same rule: nothing about one distinguishes it from another.
    return true
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('hr')
    rule.className = 'cm-md-rule'
    return rule
  }
}

/**
 * A GitHub alert's `> [!NOTE]` line, as the callout's title.
 *
 * The title is the marker's own word, untranslated: it stands for text inside the document rather
 * than for a piece of the app's interface, and GitHub will render that same document under the
 * English word whatever language the writer works in.
 */
export class AlertTitleWidget extends WidgetType {
  constructor(readonly kind: string) {
    super()
  }

  eq(other: AlertTitleWidget): boolean {
    return other.kind === this.kind
  }

  toDOM(): HTMLElement {
    const title = document.createElement('span')
    title.className = `cm-md-alert-title cm-md-alert-${this.kind}`
    title.textContent = this.kind.charAt(0).toUpperCase() + this.kind.slice(1)
    return title
  }
}

/**
 * A GFM table, as the table.
 *
 * Read-only, like every block widget here: editing a cell means putting the caret in the block,
 * which brings its source back. A table editable in place is a second editor with its own
 * navigation, and it would be the one part of this surface that answers to different rules.
 */
export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source
  }

  toDOM(): HTMLElement {
    const table = parseMarkdownTable(this.source)
    const element = document.createElement('table')
    element.className = 'cm-md-table'
    if (!table) {
      element.textContent = this.source
      return element
    }

    const head = element.appendChild(document.createElement('thead'))
    const headRow = head.appendChild(document.createElement('tr'))
    table.header.forEach((cell, column) => {
      const th = headRow.appendChild(document.createElement('th'))
      th.textContent = cell
      if (table.align[column]) th.style.textAlign = table.align[column]
    })

    const body = element.appendChild(document.createElement('tbody'))
    for (const row of table.rows) {
      const tr = body.appendChild(document.createElement('tr'))
      row.forEach((cell, column) => {
        const td = tr.appendChild(document.createElement('td'))
        td.textContent = cell
        if (table.align[column]) td.style.textAlign = table.align[column]
      })
    }
    return element
  }
}

/**
 * A fenced diagram, as the diagram.
 *
 * The rendering is asynchronous and belongs to the app — the package has no diagram engine and
 * wants none — so the widget is handed a promise of markup and fills itself in when it arrives.
 * A failure leaves the source on screen rather than an empty box: a diagram that does not parse is
 * something the writer needs to see, not something to hide.
 */
export class DiagramWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly render: (code: string) => Promise<string | null>
  ) {
    super()
  }

  eq(other: DiagramWidget): boolean {
    return other.code === this.code
  }

  toDOM(): HTMLElement {
    const host = document.createElement('div')
    host.className = 'cm-md-diagram'
    host.textContent = this.code

    void this.render(this.code)
      .then((svg) => {
        if (svg) host.innerHTML = svg
      })
      .catch(() => {
        host.classList.add('cm-md-diagram-failed')
      })

    return host
  }
}
