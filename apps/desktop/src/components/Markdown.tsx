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
            className="my-3 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3.5 font-mono text-xs leading-relaxed text-foreground select-text"
          >
            {lang && (
              <div className="mb-1.5 font-sans text-[9px] font-bold tracking-wider text-muted-foreground uppercase select-none">
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
                <h1 key={lIdx} className="scroll-m-20 text-lg font-extrabold tracking-tight border-b border-border pb-1 mt-6 mb-3 text-foreground font-sans">
                  {trimmed.substring(2)}
                </h1>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h2 key={lIdx} className="scroll-m-20 text-base font-bold tracking-tight mt-5 mb-2.5 text-foreground/90 font-sans">
                  {trimmed.substring(3)}
                </h2>
              )
            }
            if (trimmed.startsWith('### ')) {
              return (
                <h3 key={lIdx} className="scroll-m-20 text-sm font-semibold tracking-tight mt-4 mb-2 text-foreground/85 font-sans">
                  {trimmed.substring(4)}
                </h3>
              )
            }

            // Unordered list items
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <ul key={lIdx} className="list-disc pl-5 my-1 text-xs text-muted-foreground space-y-1 font-sans">
                  <li>{parseInline(trimmed.substring(2))}</li>
                </ul>
              )
            }

            // Ordered list items
            const olMatch = trimmed.match(/^(\d+)\.\s(.*)/)
            if (olMatch) {
              return (
                <ol key={lIdx} className="list-decimal pl-5 my-1 text-xs text-muted-foreground space-y-1 font-sans">
                  <li>{parseInline(olMatch[2])}</li>
                </ol>
              )
            }

            // Blockquotes
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote key={lIdx} className="border-l-2 border-primary/50 pl-3 my-2 text-xs italic text-muted-foreground bg-muted/10 py-1 rounded-r font-sans">
                  {parseInline(trimmed.substring(2))}
                </blockquote>
              )
            }

            // Standard paragraph
            return (
              <p key={lIdx} className="text-xs text-muted-foreground leading-relaxed font-sans my-1 text-justify">
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
        <code key={idx} className="bg-muted border border-border/40 px-1 py-0.5 rounded font-mono text-[10px] text-primary leading-none">
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
            className="text-primary hover:underline font-medium hover:text-primary/80 transition-colors"
          >
            {m[1]}
          </a>
        )
      }
    }
    return part
  })
}
