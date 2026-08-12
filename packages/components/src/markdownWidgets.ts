import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'

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
