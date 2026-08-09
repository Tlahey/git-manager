import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { toAssetUrl } = vi.hoisted(() => ({
  toAssetUrl: vi.fn((path: string) => `asset://localhost${path}`),
}))
vi.mock('../../../lib/assetUrl', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/assetUrl')>('../../../lib/assetUrl')
  return { ...actual, toAssetUrl }
})

import { MarkdownVideo } from './MarkdownVideo'
import { MarkdownRenderer } from '../MarkdownRenderer'

describe('MarkdownVideo', () => {
  it('resolves a repo-relative attachment to an asset URL', () => {
    render(<MarkdownVideo src=".git-manager/attachments/abc123.mp4" repoPath="/repo" />)
    expect(screen.getByTestId('markdown-video')).toHaveAttribute(
      'src',
      'asset://localhost/repo/.git-manager/attachments/abc123.mp4'
    )
  })

  it('passes a remote source through untouched', () => {
    render(<MarkdownVideo src="https://example.com/clip.mp4" repoPath="/repo" />)
    expect(screen.getByTestId('markdown-video')).toHaveAttribute(
      'src',
      'https://example.com/clip.mp4'
    )
  })

  it('does not preload or autoplay — a card can hold several recordings', () => {
    render(<MarkdownVideo src="https://example.com/clip.mp4" />)
    const video = screen.getByTestId('markdown-video')
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).not.toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('controls')
  })

  it('renders nothing without a source', () => {
    render(<MarkdownVideo repoPath="/repo" />)
    expect(screen.queryByTestId('markdown-video')).not.toBeInTheDocument()
  })
})

/**
 * The point of the two schemas: a board card may embed a video, a stranger's README may not. These
 * assert the boundary directly, because widening the wrong schema is a silent security regression —
 * everything would still render, just for content nobody here controls.
 */
describe('video is gated on content provenance', () => {
  const markdown = '<video src="https://example.com/clip.mp4"></video>'

  it('renders a video in markdown the user authored', () => {
    render(<MarkdownRenderer content={markdown} authored />)
    expect(screen.getByTestId('markdown-video')).toBeInTheDocument()
  })

  it('strips it from untrusted markdown, which is the default', () => {
    render(<MarkdownRenderer content={markdown} />)
    expect(screen.queryByTestId('markdown-video')).not.toBeInTheDocument()
  })
})
