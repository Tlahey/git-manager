/**
 * Renders a mermaid diagram to SVG, outside React.
 *
 * Kept apart from `MermaidBlock` because the same rendering is now wanted from two places that
 * share no React tree: the markdown renderer's component, and a CodeMirror widget in the formatted
 * editor, which owns plain DOM and cannot mount a component into it.
 *
 * Mermaid is loaded on demand: statically imported it added ~640 kB (~150 kB gzipped) to the chunk
 * the app boots from, for a feature most documents never use — and the renderer that pulls it in is
 * mounted by the dashboard, so every launch would pay for it.
 */
async function loadMermaid() {
  return (await import('mermaid')).default
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Mermaid themes its own SVG, so it has to be told which way the app is painted. */
function prefersDark(): boolean {
  const theme = document.documentElement.dataset.theme ?? ''
  return (
    theme.includes('dark') ||
    document.documentElement.classList.contains('dark') ||
    (typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false))
  )
}

/**
 * Returns the SVG for a diagram, or `null` for an empty one.
 *
 * `securityLevel: 'strict'` — mermaid's own default — is what makes the result safe to inject as
 * markup: it escapes HTML labels and ignores `click` directives. These diagrams come from READMEs
 * and pull request descriptions nobody here controls, so `loose` would let that content put markup
 * straight into the app. Rejects when mermaid cannot parse the source; the caller decides what to
 * show instead.
 */
export async function renderMermaid(code: string, id: string): Promise<string | null> {
  const source = unescapeHtml(code).trim()
  if (!source) return null

  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    theme: prefersDark() ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit',
  })

  // A fresh id per render: mermaid keys its internal definitions off it, and reusing one leaves the
  // previous diagram's markup behind.
  const { svg } = await mermaid.render(`${id}-${Math.random().toString(36).slice(2, 9)}`, source)
  return svg
}
