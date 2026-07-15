import React, { useMemo } from 'react'

interface MarkdownProps {
  content: string
}

export function Markdown({ content }: MarkdownProps) {
  // Split by code blocks first
  const parsedContent = useMemo(() => {
    if (!content) return null

    // Split by code blocks: ```lang ... ```
    const parts = content.split(/(```[\s\S]*?```)/g)

    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/)
        const lang = match ? match[1] : ''
        const code = match ? match[2] : part.slice(3, -3)
        return (
          <pre
            key={index}
            className="my-3 select-text overflow-x-auto rounded-lg border border-border bg-muted/30 p-3.5 font-mono text-xs leading-relaxed text-foreground"
          >
            {lang && (
              <div className="mb-1.5 select-none font-sans text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {lang}
              </div>
            )}
            <code>{code.trim()}</code>
          </pre>
        )
      }

      // Handle standard line-by-line block structures (headers, lists, paragraphs)
      const lines = part.split('\n')
      return (
        <div key={index} className="space-y-2">
          {lines.map((line, lIdx) => {
            const trimmed = line.trim()
            if (!trimmed) return <div key={lIdx} className="h-1" />

            // Headers
            if (trimmed.startsWith('# ')) {
              return (
                <h1
                  key={lIdx}
                  className="mb-3 mt-6 scroll-m-20 border-b border-border pb-1 font-sans text-lg font-extrabold tracking-tight text-foreground"
                >
                  {trimmed.substring(2)}
                </h1>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h2
                  key={lIdx}
                  className="mb-2.5 mt-5 scroll-m-20 font-sans text-base font-bold tracking-tight text-foreground/90"
                >
                  {trimmed.substring(3)}
                </h2>
              )
            }
            if (trimmed.startsWith('### ')) {
              return (
                <h3
                  key={lIdx}
                  className="mb-2 mt-4 scroll-m-20 font-sans text-sm font-semibold tracking-tight text-foreground/85"
                >
                  {trimmed.substring(4)}
                </h3>
              )
            }

            // GFM task list items: "- [ ] todo" / "- [x] done" (must be checked before
            // the generic unordered-list branch below, since they share the "- "/"* " prefix)
            const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/)
            if (taskMatch) {
              const checked = taskMatch[1].toLowerCase() === 'x'
              return (
                <ul
                  key={lIdx}
                  className="my-1 list-none space-y-1 pl-1 font-sans text-xs text-muted-foreground"
                >
                  <li className="flex items-start gap-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled
                      className="mt-0.5 h-3 w-3 shrink-0 accent-primary"
                    />
                    <span className={checked ? 'text-muted-foreground/60 line-through' : undefined}>
                      {parseInline(taskMatch[2])}
                    </span>
                  </li>
                </ul>
              )
            }

            // Unordered list items
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <ul
                  key={lIdx}
                  className="my-1 list-disc space-y-1 pl-5 font-sans text-xs text-muted-foreground"
                >
                  <li>{parseInline(trimmed.substring(2))}</li>
                </ul>
              )
            }

            // Ordered list items
            const olMatch = trimmed.match(/^(\d+)\.\s(.*)/)
            if (olMatch) {
              return (
                <ol
                  key={lIdx}
                  className="my-1 list-decimal space-y-1 pl-5 font-sans text-xs text-muted-foreground"
                >
                  <li>{parseInline(olMatch[2])}</li>
                </ol>
              )
            }

            // Blockquotes
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote
                  key={lIdx}
                  className="my-2 rounded-r border-l-2 border-primary/50 bg-muted/10 py-1 pl-3 font-sans text-xs italic text-muted-foreground"
                >
                  {parseInline(trimmed.substring(2))}
                </blockquote>
              )
            }

            // Standard paragraph
            return (
              <p
                key={lIdx}
                className="my-1 text-justify font-sans text-xs leading-relaxed text-muted-foreground"
              >
                {parseInline(line)}
              </p>
            )
          })}
        </div>
      )
    })
  }, [content])

  return <div className="space-y-3 pr-1">{parsedContent}</div>
}

function parseInline(text: string): React.ReactNode[] {
  // Matches bold (**text**), code (`text`), links ([text](url))
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g
  const parts = text.split(regex)

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="rounded border border-border/40 bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-primary"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('[') && part.includes('](')) {
      const m = part.match(/\[(.*?)\]\((.*?)\)/)
      if (m) {
        return (
          <a
            key={idx}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
          >
            {m[1]}
          </a>
        )
      }
    }
    return part
  })
}
