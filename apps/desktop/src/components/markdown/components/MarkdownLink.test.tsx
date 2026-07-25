import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { apiOpenUrl } = vi.hoisted(() => ({ apiOpenUrl: vi.fn() }))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))

import { MarkdownLink } from './MarkdownLink'

beforeEach(() => {
  vi.clearAllMocks()
  apiOpenUrl.mockResolvedValue(undefined)
})

describe('MarkdownLink — external links', () => {
  it('opens http(s) and mailto links in the system browser instead of the webview', async () => {
    const user = userEvent.setup()
    render(<MarkdownLink href="https://example.com/docs">docs</MarkdownLink>)

    await user.click(screen.getByTestId('markdown-link'))

    expect(apiOpenUrl).toHaveBeenCalledWith('https://example.com/docs')
    expect(screen.getByTestId('markdown-link')).toHaveAttribute('target', '_blank')
  })

  it('does not open a repo-relative link, which the app cannot serve', async () => {
    const user = userEvent.setup()
    render(<MarkdownLink href="./CONTRIBUTING.md">contributing</MarkdownLink>)

    const link = screen.getByTestId('markdown-link')
    await user.click(link)

    expect(apiOpenUrl).not.toHaveBeenCalled()
    // No `target="_blank"`: nothing should ask the webview to navigate anywhere.
    expect(link).not.toHaveAttribute('target')
  })
})

describe('MarkdownLink — in-page anchors', () => {
  it('scrolls to the anchor rather than navigating', async () => {
    const user = userEvent.setup()
    const target = document.createElement('div')
    target.id = 'installation'
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    render(<MarkdownLink href="#installation">Installation</MarkdownLink>)
    await user.click(screen.getByTestId('markdown-link'))

    expect(target.scrollIntoView).toHaveBeenCalled()
    expect(apiOpenUrl).not.toHaveBeenCalled()
    target.remove()
  })

  it('finds an anchor the sanitizer prefixed, as it does for ids written in the document', async () => {
    const user = userEvent.setup()
    const target = document.createElement('h2')
    target.id = 'user-content-install'
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    render(<MarkdownLink href="#install">Install</MarkdownLink>)
    await user.click(screen.getByTestId('markdown-link'))

    expect(target.scrollIntoView).toHaveBeenCalled()
    target.remove()
  })

  it('stays put when the anchor does not exist', async () => {
    const user = userEvent.setup()
    render(<MarkdownLink href="#missing">Missing</MarkdownLink>)

    await user.click(screen.getByTestId('markdown-link'))

    expect(apiOpenUrl).not.toHaveBeenCalled()
  })
})

describe('MarkdownLink — DOM hygiene', () => {
  it('keeps react-markdown’s hast node out of the rendered attributes', () => {
    render(
      <MarkdownLink href="https://example.com" node={{ type: 'element', tagName: 'a' }}>
        link
      </MarkdownLink>
    )

    expect(screen.getByTestId('markdown-link')).not.toHaveAttribute('node')
  })
})
