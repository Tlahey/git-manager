import { useEffect, useRef, useState, useId } from 'react'
import mermaid from 'mermaid'
import { AlertTriangle } from 'lucide-react'

interface MermaidBlockProps {
  code: string
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)
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

        const currentTheme = document.documentElement.dataset.theme || ''
        const isDark =
          currentTheme.includes('dark') ||
          document.documentElement.classList.contains('dark') ||
          (typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches)

        const mermaidEngine =
          typeof (mermaid as any)?.render === 'function'
            ? mermaid
            : (mermaid as any)?.default && typeof (mermaid as any)?.default?.render === 'function'
              ? (mermaid as any).default
              : mermaid

        mermaidEngine.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        })

        // Clean previous renders
        const renderId = `${uniqueId}-${Math.random().toString(36).substring(2, 9)}`
        const { svg } = await mermaidEngine.render(renderId, cleanCode)

        if (isMounted) {
          setSvgContent(svg)
          setError(null)
          setLoading(false)
        }
      } catch (err: any) {
        console.warn('Mermaid rendering failed:', err)
        if (isMounted) {
          setError(err?.message || 'Erreur lors du rendu du diagramme Mermaid')
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

  if (error) {
    return (
      <div
        className="my-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-foreground"
        data-testid="mermaid-error-fallback"
      >
        <div className="mb-2 flex items-center gap-2 text-destructive font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Impossible d'afficher le diagramme Mermaid</span>
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
        <div className="py-4 text-xs text-muted-foreground animate-pulse" data-testid="mermaid-loading">
          Chargement du diagramme...
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svgContent || '' }}
      />
    </div>
  )
}
