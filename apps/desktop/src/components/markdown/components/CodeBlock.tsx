import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { MermaidBlock } from './MermaidBlock'

interface CodeBlockProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

export function CodeBlock({ inline, className, children, ...props }: CodeBlockProps) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const codeString = String(children || '').replace(/\n$/, '')

  const [copied, setCopied] = useState(false)

  // Handle inline code snippet e.g. `const x = 1`
  if (inline || !className) {
    return (
      <code
        className="rounded border border-border/50 bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary"
        data-testid="inline-code"
        {...props}
      >
        {children}
      </code>
    )
  }

  // Handle Mermaid diagrams
  if (language === 'mermaid') {
    return <MermaidBlock code={codeString} />
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <div
      className="group relative my-3 overflow-hidden rounded-lg border border-border bg-muted/30 font-mono text-xs leading-relaxed"
      data-testid="code-block"
    >
      {/* Code Header Bar */}
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/60 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground select-none">
        <span className="uppercase tracking-wider font-sans">{(language || 'text').toUpperCase()}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Copier le code"
          data-testid="code-block-copy-button"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Copié</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <pre className="overflow-x-auto p-3.5 text-foreground select-text font-mono">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  )
}
