import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { toAssetUrl } = vi.hoisted(() => ({
  toAssetUrl: vi.fn((path: string) => `asset://localhost${path}`),
}))
vi.mock('../../../lib/assetUrl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/assetUrl')>()),
  toAssetUrl,
}))

import { MarkdownImage } from './MarkdownImage'
import { resolveImageSrc } from './resolveImageSrc'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveImageSrc', () => {
  it('passes remote and inline sources through untouched', () => {
    for (const src of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'data:image/gif;base64,R0lGOD',
      'blob:abc',
      'asset://localhost/a.png',
    ]) {
      expect(resolveImageSrc(src, '/repo')).toBe(src)
    }
  })

  it("resolves a document-relative path against the file's repository", () => {
    expect(resolveImageSrc('docs/logo.png', '/repo')).toBe('asset://localhost/repo/docs/logo.png')
    expect(resolveImageSrc('./docs/logo.png', '/repo')).toBe('asset://localhost/repo/docs/logo.png')
  })

  it('treats an absolute path as repository-root relative, not as a path on this machine', () => {
    // A README saying `/docs/logo.png` means the repo root (GitHub's own convention). Reading the
    // real filesystem there would let a stranger's pull request point at anything.
    expect(resolveImageSrc('/docs/logo.png', '/repo')).toBe('asset://localhost/repo/docs/logo.png')
    expect(toAssetUrl).not.toHaveBeenCalledWith('/docs/logo.png')
  })

  it('leaves a path alone when there is no repository to resolve it against', () => {
    expect(resolveImageSrc('docs/logo.png')).toBe('docs/logo.png')
    expect(resolveImageSrc('/etc/hosts')).toBe('/etc/hosts')
    expect(toAssetUrl).not.toHaveBeenCalled()
  })

  it('returns an empty source rather than undefined for an image with no src', () => {
    expect(resolveImageSrc(undefined, '/repo')).toBe('')
  })
})

describe('MarkdownImage', () => {
  it('renders the resolved source with the alt text the document gave it', () => {
    render(<MarkdownImage src="docs/logo.png" alt="Logo" repoPath="/repo" />)

    const img = screen.getByTestId('markdown-image')
    expect(img).toHaveAttribute('src', 'asset://localhost/repo/docs/logo.png')
    expect(img).toHaveAttribute('alt', 'Logo')
  })

  it('always carries an alt attribute, even for a decorative image', () => {
    render(<MarkdownImage src="docs/logo.png" repoPath="/repo" />)
    expect(screen.getByTestId('markdown-image')).toHaveAttribute('alt', '')
  })

  it('caps an unsized image so one screenshot cannot fill the whole pane', () => {
    render(<MarkdownImage src="a.png" repoPath="/repo" />)
    expect(screen.getByTestId('markdown-image')).toHaveStyle({ maxHeight: '500px' })
  })

  it('honours explicit dimensions instead of capping them', () => {
    render(<MarkdownImage src="a.png" width={128} height={64} repoPath="/repo" />)

    const img = screen.getByTestId('markdown-image')
    expect(img).toHaveStyle({ width: '128px', height: '64px' })
    expect(img.style.maxHeight).toBe('')
  })

  it('loads lazily — a README can hold a lot of screenshots', () => {
    render(<MarkdownImage src="a.png" repoPath="/repo" />)
    expect(screen.getByTestId('markdown-image')).toHaveAttribute('loading', 'lazy')
  })
})
