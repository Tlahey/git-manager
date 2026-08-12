import { useEffect, useRef, useState, useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { renderMermaid } from './renderMermaid'

interface MermaidBlockProps {
  code: string
}

/**
 * A fenced `mermaid` block, rendered.
 *
 * The rendering itself lives in `renderMermaid`, since the formatted editor draws the same diagrams
 * from a CodeMirror widget that has no React tree to mount a component into.
 */
export function MermaidBlock({ code }: MermaidBlockProps) {
  const { t } = useTranslation('common')
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  // Holds the failure reason for debugging; the banner only cares that it isn't null.
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const rawId = useId()
  const uniqueId = `mermaid-${rawId.replace(/:/g, '')}`

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    renderMermaid(code, uniqueId)
      .then((svg) => {
        if (!isMounted) return
        setSvgContent(svg)
        setLoading(false)
      })
      .catch((failure: unknown) => {
        console.warn('Mermaid rendering failed:', failure)
        if (!isMounted) return
        setError(failure instanceof Error ? failure.message : String(failure))
        setSvgContent(null)
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [code, uniqueId])

  if (error !== null) {
    return (
      <div
        className="my-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-foreground"
        data-testid="mermaid-error-fallback"
      >
        <div className="mb-2 flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t('markdown.mermaid.error')}</span>
        </div>
        <pre className="overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] text-muted-foreground">
          {code}
        </pre>
      </div>
    )
  }

  return (
    <div
      className="my-4 flex flex-col items-center justify-center overflow-x-auto rounded-lg border border-border bg-card/60 p-4 select-text"
      data-testid="mermaid-block"
    >
      {loading && (
        <div
          className="animate-pulse py-4 text-xs text-muted-foreground"
          data-testid="mermaid-loading"
        >
          {t('markdown.mermaid.loading')}
        </div>
      )}
      <div
        ref={containerRef}
        className="flex w-full justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svgContent || '' }}
      />
    </div>
  )
}
