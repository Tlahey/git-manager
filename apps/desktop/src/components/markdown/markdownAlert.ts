import { Children, cloneElement, isValidElement, type ReactNode } from 'react'

/**
 * GitHub's alert syntax — a blockquote whose first line is `[!NOTE]` and friends — recognised from
 * the *rendered* children rather than the source.
 *
 * It is done here, on the React side, because nothing upstream knows about it: `remark-gfm` does
 * not implement alerts, so the marker survives as ordinary text at the head of the quote's first
 * paragraph. Left alone it renders as a literal `[!NOTE]`, which is why the toolbar's alert button
 * would otherwise lie to anyone writing a board card — there, the app's own rendering *is* the
 * final one, with no GitHub to re-render it later.
 */
export type MarkdownAlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution'

export interface MarkdownAlert {
  kind: MarkdownAlertKind
  /** The quote's content with the marker line removed. */
  content: ReactNode
}

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\S\n]*\n?/

/** Blank strings sit between a blockquote's elements — react-markdown keeps the source's newlines
 * as text nodes, so the first *element* is rarely the first child. */
function isBlank(node: ReactNode): boolean {
  return typeof node === 'string' && node.trim() === ''
}

/** Returns the alert a blockquote carries, or `null` for an ordinary quote. */
export function parseMarkdownAlert(children: ReactNode): MarkdownAlert | null {
  const nodes = Children.toArray(children)
  const start = nodes.findIndex((node) => !isBlank(node))
  const first = nodes[start]
  const siblings = nodes.slice(start + 1)
  if (!isValidElement<{ children?: ReactNode }>(first)) return null

  const [head, ...rest] = Children.toArray(first.props.children)
  if (typeof head !== 'string') return null

  const match = head.match(MARKER)
  if (!match) return null

  const remainder = head.slice(match[0].length)
  const body = remainder ? [remainder, ...rest] : rest

  return {
    kind: match[1].toLowerCase() as MarkdownAlertKind,
    // An alert with no text is a marker on its own — keep the paragraph out rather than render an
    // empty one under the title.
    content: body.length ? [cloneElement(first, undefined, body), ...siblings] : siblings,
  }
}
