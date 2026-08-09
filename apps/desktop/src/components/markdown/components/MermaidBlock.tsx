import { useEffect, useRef, useState, useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'

interface MermaidBlockProps {
  code: string
}

/**
 * Mermaid is loaded on demand, and only for documents that actually contain a diagram.
 *
 * Statically imported it added ~640 kB (~150 kB gzipped) to the chunk the app boots from, for a
 * feature most READMEs never use — and the renderer that pulls this component in is mounted by the
 * dashboard, so every launch paid for it.
 */
async function loadMermaid() {
  return (await import('mermaid')).default
}

function unescapeHtml(str: string) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

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

    async function renderDiagram() {
      const cleanCode = unescapeHtml(code).trim()
      if (!cleanCode) {
        if (isMounted) {
          setSvgContent(null)
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setError(null)

        const mermaid = await loadMermaid()
        if (!isMounted) return

        const currentTheme = document.documentElement.dataset.theme || ''
        const isDark =
          currentTheme.includes('dark') ||
          document.documentElement.classList.contains('dark') ||
          (typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-color-scheme: dark)').matches)

        // `strict` (Mermaid's own default) is what makes the generated SVG safe to hand to
        // `dangerouslySetInnerHTML` below: it escapes HTML labels and ignores `click` directives.
        // The diagrams rendered here come from READMEs and PR descriptions we don't control, so
        // `loose` would let that content inject markup straight into the app.
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        })

        // Clean previous renders
        const renderId = `${uniqueId}-${Math.random().toString(36).substring(2, 9)}`
        const { svg } = await mermaid.render(renderId, cleanCode)

        if (isMounted) {
          setSvgContent(svg)
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        console.warn('Mermaid rendering failed:', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err))
          setSvgContent(null)
          setLoading(false)
        }
      }
    }

    renderDiagram()

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
