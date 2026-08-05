import type { ReactNode } from 'react'

/**
 * Flattens the `children` react-markdown hands a custom `code` component into its source text.
 *
 * For a fenced or inline code node those children are a string, or an array of strings when the
 * source spans several lines — never elements. Spelling that out here (rather than calling
 * `String(children)`) keeps the one case the type allows but the parser never produces from
 * silently rendering `[object Object]` into the copy button and the syntax highlighter.
 */
export function codeText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map((child) => codeText(child)).join('')
  return ''
}
