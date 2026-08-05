// Kept out of `MarkdownLink.tsx` so that file exports components only — a module mixing a component
// with a plain helper loses Vite's Fast Refresh (`react/only-export-components`).

const EXTERNAL_PROTOCOLS = ['http://', 'https://', 'mailto:']

export function isExternalHref(href: string | undefined): boolean {
  return Boolean(href && EXTERNAL_PROTOCOLS.some((protocol) => href.startsWith(protocol)))
}
