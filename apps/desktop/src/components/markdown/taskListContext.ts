import { createContext } from 'react'

export interface MarkdownTaskListContextValue {
  /** Set by a renderer whose document is editable: ticks the task item written on `line`. */
  onToggle?: (line: number, checked: boolean) => void
  /** A toggle is being saved — the checkboxes stay frozen until the document comes back. */
  pending?: boolean
}

/**
 * Wires a rendered checkbox back to the source it came from. Two contexts rather than one prop
 * because react-markdown builds the `input` and its `li` as separate component overrides: the
 * renderer publishes the callback once, and each list item publishes its own source line — the
 * nearest provider wins, so a nested task list toggles its own line and not its parent's.
 */
export const MarkdownTaskListContext = createContext<MarkdownTaskListContextValue>({})

/** The 1-based source line of the enclosing list item, or `null` outside one. */
export const MarkdownTaskItemLineContext = createContext<number | null>(null)
