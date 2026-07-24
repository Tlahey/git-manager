import ReactMarkdown from 'react-markdown'
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
            <MarkdownTableCell isHeader align={style?.textAlign as any}>
              {children}
            </MarkdownTableCell>
          ),
          td: ({ children, style }) => (
            <MarkdownTableCell align={style?.textAlign as any}>{children}</MarkdownTableCell>
          ),
          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              return <MarkdownTaskListInput checked={checked} />
            }
            return <input type={type} checked={checked} disabled />
          },
          code: ({ node, inline, className, children, ...props }: any) => {
            const isInline = inline ?? (!className && !String(children || '').includes('\n'))
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
          img: ({ src, alt, width, height, ...props }: any) => (
            <MarkdownImage
              src={src}
              alt={alt}
              width={width}
              height={height}
              repoPath={repoPath}
              {...props}
            />
          ),
          div: ({ align, children, className, ...props }: any) => {
            if (align === 'center') {
              return (
                <div
                  align="center"
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
