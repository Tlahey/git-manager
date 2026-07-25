import React from 'react'
import { apiOpenUrl } from '../../../api/shell.api'

interface MarkdownLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string
  children?: React.ReactNode
  /** react-markdown hands custom components the hast node; it must not reach the DOM. */
  node?: unknown
}

const EXTERNAL_PROTOCOLS = ['http://', 'https://', 'mailto:']

export function isExternalHref(href: string | undefined): boolean {
  return Boolean(href && EXTERNAL_PROTOCOLS.some((protocol) => href.startsWith(protocol)))
}

/**
 * Anchor for rendered markdown.
 *
 * Every click is intercepted, because none of the three cases may reach the webview's default
 * navigation: an external link belongs in the user's browser (the app is a single document with
 * nowhere to navigate back from), an in-page anchor has to scroll instead of loading
 * `tauri://localhost/#…`, and a repo-relative link (`./CONTRIBUTING.md`) points at a URL the app
 * doesn't serve — following it blanks the window.
 */
export function MarkdownLink({ href, children, node: _node, ...props }: MarkdownLinkProps) {
  const isExternal = isExternalHref(href)

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()

    if (isExternal) {
      apiOpenUrl(href as string).catch((err) => console.error('Error opening link:', err))
      return
    }

    if (href?.startsWith('#')) {
      // `rehype-slug` gives headings their ids, and the sanitizer prefixes ids that came from the
      // document itself — so a table of contents entry is looked up both ways before giving up.
      const anchor = decodeURIComponent(href.slice(1))
      const target =
        document.getElementById(anchor) ?? document.getElementById(`user-content-${anchor}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      target={isExternal ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
      data-testid="markdown-link"
      {...props}
    >
      {children}
    </a>
  )
}
