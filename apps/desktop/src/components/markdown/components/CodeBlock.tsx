import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip } from '@git-manager/ui'
import { MermaidBlock } from './MermaidBlock'
import { codeText } from '../markdownText'

interface CodeBlockProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

export function CodeBlock({ inline, className, children, ...props }: CodeBlockProps) {
  const { t } = useTranslation('common')
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const codeString = codeText(children).replace(/\n$/, '')

  const [copied, setCopied] = useState(false)

  // Handle inline code snippet e.g. `const x = 1`. Trust the caller's `inline` flag alone: a fenced
  // block with no language tag (a plain ``` fence) also has no `className`, so falling back to
  // `!className` here used to misclassify it as inline — MarkdownRenderer already tells us apart by
  // checking for a newline too, which a bare `!className` check can't do.
  if (inline) {
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
        <span className="font-sans tracking-wider uppercase">
          {(language || 'text').toUpperCase()}
        </span>
        <Tooltip content={t('markdown.code.copyTooltip')}>
          <button
            onClick={handleCopy}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('markdown.code.copyTooltip')}
            data-testid="code-block-copy-button"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-tone-success" />
                <span className="text-tone-success">{t('markdown.code.copied')}</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>{t('markdown.code.copy')}</span>
              </>
            )}
          </button>
        </Tooltip>
      </div>

      {/* Code Content */}
      <pre className="overflow-x-auto p-3.5 font-mono text-foreground select-text">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  )
}
