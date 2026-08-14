import { Fragment, useMemo, type ReactNode } from 'react'
import { parseInlineMarkdown, type InlineMarkdownNode } from './parseInlineMarkdown'

export interface InlineMarkdownProps {
  /** The raw one-line markdown — a card title, a heading, anything that has no blocks in it. */
  text: string
}

/**
 * Renders the inline markdown of a single line of text, and nothing else.
 *
 * It returns a fragment rather than an element on purpose: the caller already owns the element that
 * sets the size, the clamp and the colour (`<p className="line-clamp-2 …">`), and wrapping the
 * result in a second one would put a `<span>` between that element and its own text.
 *
 * See `parseInlineMarkdown.ts` for why this exists beside `MarkdownRenderer` rather than reusing it.
 */
export function InlineMarkdown({ text }: InlineMarkdownProps) {
  const nodes = useMemo(() => parseInlineMarkdown(text), [text])
  return <>{renderNodes(nodes)}</>
}

function renderNodes(nodes: InlineMarkdownNode[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>
      case 'code':
        return (
          <code
            key={index}
            className="rounded-[3px] bg-muted px-1 py-px font-mono text-[0.92em] text-foreground"
          >
            {node.text}
          </code>
        )
      case 'strong':
        return (
          <strong key={index} className="font-semibold">
            {renderNodes(node.children)}
          </strong>
        )
      case 'em':
        return (
          <em key={index} className="italic">
            {renderNodes(node.children)}
          </em>
        )
      case 'del':
        return (
          <s key={index} className="opacity-70">
            {renderNodes(node.children)}
          </s>
        )
    }
  })
}
