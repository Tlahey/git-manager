import { isValidElement, type ReactNode } from 'react'

/**
 * Flattens the `children` react-markdown hands a custom `code` component into its source text.
 *
 * For a plain (unhighlighted) code node those children are a string, or an array of strings when
 * the source spans several lines. But `rehype-highlight` rewrites a fenced block's children into
 * `<span className="hljs-*">` elements, one per token — so highlighted code must also recurse into
 * `props.children`, or every keyword/string/title token silently drops out of the copy button.
 */
export function codeText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map((child) => codeText(child)).join('')
  if (isValidElement<{ children?: ReactNode }>(children)) return codeText(children.props.children)
  return ''
}
