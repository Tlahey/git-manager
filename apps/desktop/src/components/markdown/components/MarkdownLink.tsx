import React from 'react'
import { apiOpenUrl } from '../../../api/shell.api'

interface MarkdownLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string
  children?: React.ReactNode
}

export function MarkdownLink({ href, children, ...props }: MarkdownLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
      e.preventDefault()
      apiOpenUrl(href).catch((err) => console.error('Error opening link:', err))
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
      data-testid="markdown-link"
      {...props}
    >
      {children}
    </a>
  )
}
