import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import { CodeBlock } from './components/CodeBlock'
import { MarkdownLink } from './components/MarkdownLink'
import { MarkdownTable, MarkdownTableCell, MarkdownTableHead } from './components/MarkdownTable'
import { MarkdownTaskListInput } from './components/MarkdownTaskList'
import { MarkdownImage } from './components/MarkdownImage'
import './markdown.css'

export interface MarkdownRendererProps {
  content: string
  className?: string
  repoPath?: string
}

/** remark-gfm encodes a table column's alignment as an inline `text-align` style, whose CSS type is
 * far wider than the three values MarkdownTableCell renders — anything else falls back to `null`
 * (its default, left-aligned). */
function cellAlign(textAlign: CSSProperties['textAlign']): 'left' | 'center' | 'right' | null {
  return textAlign === 'left' || textAlign === 'center' || textAlign === 'right' ? textAlign : null
}

/** `align` is a legacy HTML attribute React doesn't type on `div`, but rehype-raw passes it through
 * from raw HTML in the markdown (READMEs use `<div align="center">` for banners). */
type MarkdownDivProps = ComponentPropsWithoutRef<'div'> & ExtraProps & { align?: string }

export function MarkdownRenderer({ content, className = '', repoPath }: MarkdownRendererProps) {
  if (!content) return null

  return (
    <div
      className={`markdown-body space-y-3 font-sans text-xs text-foreground ${className}`}
      data-testid="markdown-renderer"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          a: MarkdownLink,
          table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
          thead: ({ children }) => <MarkdownTableHead>{children}</MarkdownTableHead>,
          th: ({ children, style }) => (
            <MarkdownTableCell isHeader align={cellAlign(style?.textAlign)}>
              {children}
            </MarkdownTableCell>
          ),
          td: ({ children, style }) => (
            <MarkdownTableCell align={cellAlign(style?.textAlign)}>{children}</MarkdownTableCell>
          ),
          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              return <MarkdownTaskListInput checked={checked} />
            }
            return <input type={type} checked={checked} disabled />
          },
          // react-markdown dropped the `inline` prop in v9, so inline-ness is inferred: fenced code
          // carries a `language-*` class, inline code doesn't (and never spans several lines).
          code: ({ node: _node, className, children, ...props }) => {
            const isInline = !className && !String(children || '').includes('\n')
            return (
              <CodeBlock inline={isInline} className={className} {...props}>
                {children}
              </CodeBlock>
            )
          },
          h1: ({ children }) => (
            <h1 className="mb-3 mt-6 scroll-m-20 border-b border-border pb-1 text-lg font-extrabold tracking-tight text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2.5 mt-5 scroll-m-20 text-base font-bold tracking-tight text-foreground/90">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 scroll-m-20 text-sm font-semibold tracking-tight text-foreground/85">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1.5 mt-3 text-xs font-semibold text-foreground/80">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="my-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-1.5 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 rounded-r border-l-2 border-primary/60 bg-muted/20 py-1.5 pl-3.5 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          img: ({ node: _node, src, alt, width, height, ...props }) => (
            <MarkdownImage
              src={src}
              alt={alt}
              width={width}
              height={height}
              repoPath={repoPath}
              {...props}
            />
          ),
          div: ({ node: _node, align, children, className, ...props }: MarkdownDivProps) => {
            if (align === 'center') {
              // The attribute is re-emitted on purpose: markdown.css styles `[align="center"]`
              // (and its direct `p` children) for raw-HTML banners, not just this element.
              // React 18's typings dropped the legacy `align` attribute, hence the narrow cast —
              // the DOM still honours it.
              const alignAttr = { align: 'center' } as ComponentPropsWithoutRef<'div'>
              return (
                <div
                  {...alignAttr}
                  className={`flex flex-col items-center justify-center text-center space-y-3 my-4 ${className || ''}`}
                  {...props}
                >
                  {children}
                </div>
              )
            }
            return <div className={className} {...props}>{children}</div>
          },
          sub: ({ children }) => <sub className="text-[10px] text-muted-foreground">{children}</sub>,
          sup: ({ children }) => <sup className="text-[10px] text-muted-foreground">{children}</sup>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
