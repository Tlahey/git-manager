import { useCallback, useMemo, type ComponentPropsWithoutRef, type CSSProperties } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import { authoredMarkdownSanitizeSchema, markdownSanitizeSchema } from './sanitizeSchema'
import { CodeBlock } from './components/CodeBlock'
import { MarkdownLink } from './components/MarkdownLink'
import { MarkdownTable, MarkdownTableCell, MarkdownTableHead } from './components/MarkdownTable'
import { MarkdownTaskListInput } from './components/MarkdownTaskList'
import { MarkdownImage } from './components/MarkdownImage'
import { MarkdownVideo } from './components/MarkdownVideo'
import {
  MarkdownTaskItemLineContext,
  MarkdownTaskListContext,
  type MarkdownTaskListContextValue,
} from './taskListContext'
import { toggleTaskListItem } from './toggleTaskListItem'
import './markdown.css'

export interface MarkdownRendererProps {
  content: string
  className?: string
  repoPath?: string
  /**
   * Makes the task-list checkboxes clickable: called with the whole document rewritten around the
   * ticked item, for the caller to save. Omit it (the default) and they stay read-only, which is
   * what every document the user doesn't own — a README, a review comment — wants.
   */
  onTaskToggle?: (nextContent: string) => void
  /** Freezes the checkboxes while a toggle is on its way to the server. */
  taskTogglePending?: boolean
  /**
   * Opts into the wider allow-list for markdown **the user wrote themselves** — currently only board
   * cards and their comments — which additionally permits `<video>` so an attached recording plays
   * inline. Leave it off (the default) for anything fetched from elsewhere: a README, a pull request
   * body, a review comment. See `sanitizeSchema.ts`.
   */
  authored?: boolean
}

/** remark-gfm encodes a table column's alignment as an inline `text-align` style, whose CSS type is
 * far wider than the three values MarkdownTableCell renders — anything else falls back to `null`
 * (its default, left-aligned). The sanitizer leaves this alone: the alignment travels as the legacy
 * `align` attribute (which its allow-list keeps) and react-markdown turns that into the style. */
function cellAlign(textAlign: CSSProperties['textAlign']): 'left' | 'center' | 'right' | null {
  return textAlign === 'left' || textAlign === 'center' || textAlign === 'right' ? textAlign : null
}

/** `align` is a legacy HTML attribute React doesn't type on `div`, but rehype-raw passes it through
 * from raw HTML in the markdown (READMEs use `<div align="center">` for banners). */
type MarkdownDivProps = ComponentPropsWithoutRef<'div'> & ExtraProps & { align?: string }

export function MarkdownRenderer({
  content,
  className = '',
  repoPath,
  onTaskToggle,
  taskTogglePending,
  authored = false,
}: MarkdownRendererProps) {
  const handleTaskToggle = useCallback(
    (line: number, checked: boolean) => {
      const next = toggleTaskListItem(content, line, checked)
      if (next !== null) onTaskToggle?.(next)
    },
    [content, onTaskToggle]
  )

  const taskContext = useMemo<MarkdownTaskListContextValue>(
    () => (onTaskToggle ? { onToggle: handleTaskToggle, pending: !!taskTogglePending } : {}),
    [onTaskToggle, handleTaskToggle, taskTogglePending]
  )

  if (!content) return null

  const rendered = (
    <div
      className={`markdown-body space-y-3 font-sans text-xs text-foreground ${className}`}
      data-testid="markdown-renderer"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // `rehype-slug` runs after the sanitizer on purpose: the ids it generates are ours, and
        // the schema prefixes any id coming from the document with `user-content-` to keep it from
        // clobbering the app's own elements. Without it a README's table of contents links nowhere.
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, authored ? authoredMarkdownSanitizeSchema : markdownSanitizeSchema],
          rehypeSlug,
          rehypeHighlight,
        ]}
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
          // `id` comes from rehype-slug and must survive the override, or every anchor link in a
          // README points at a heading that no longer has a target.
          h1: ({ children, id }) => (
            <h1
              id={id}
              className="mb-3 mt-6 scroll-m-20 border-b border-border pb-1 text-lg font-extrabold tracking-tight text-foreground"
            >
              {children}
            </h1>
          ),
          h2: ({ children, id }) => (
            <h2
              id={id}
              className="mb-2.5 mt-5 scroll-m-20 text-base font-bold tracking-tight text-foreground/90"
            >
              {children}
            </h2>
          ),
          h3: ({ children, id }) => (
            <h3
              id={id}
              className="mb-2 mt-4 scroll-m-20 text-sm font-semibold tracking-tight text-foreground/85"
            >
              {children}
            </h3>
          ),
          h4: ({ children, id }) => (
            <h4 id={id} className="mb-1.5 mt-3 text-xs font-semibold text-foreground/80">
              {children}
            </h4>
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
          // The list item is the only node that still knows where the task marker was written: the
          // `input` remark-gfm inserts for a checkbox is synthesised and carries no position of its
          // own. Publishing the line here lets a checkbox find its own source line.
          li: ({ node, children, ...props }) => (
            <MarkdownTaskItemLineContext.Provider value={node?.position?.start.line ?? null}>
              <li {...props}>{children}</li>
            </MarkdownTaskItemLineContext.Provider>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 rounded-r border-l-2 border-primary/60 bg-muted/20 py-1.5 pl-3.5 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          // Only ever reached under `authoredMarkdownSanitizeSchema` — the strict schema drops the
          // tag before it gets here, so a README can't render one.
          video: ({ node: _node, src, ...props }) => (
            <MarkdownVideo src={src} repoPath={repoPath} {...props} />
          ),
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
                  className={`my-4 flex flex-col items-center justify-center space-y-3 text-center ${className || ''}`}
                  {...props}
                >
                  {children}
                </div>
              )
            }
            return (
              <div className={className} {...props}>
                {children}
              </div>
            )
          },
          sub: ({ children }) => (
            <sub className="text-[10px] text-muted-foreground">{children}</sub>
          ),
          sup: ({ children }) => (
            <sup className="text-[10px] text-muted-foreground">{children}</sup>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )

  return (
    <MarkdownTaskListContext.Provider value={taskContext}>
      {rendered}
    </MarkdownTaskListContext.Provider>
  )
}
