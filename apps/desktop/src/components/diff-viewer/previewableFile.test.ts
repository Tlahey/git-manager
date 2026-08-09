import { describe, it, expect } from 'vitest'
import { hasPreviewTab, isPreviewableImage, isPreviewableMarkdown } from './previewableFile'

describe('isPreviewableImage', () => {
  it('recognises image extensions whatever their case', () => {
    for (const path of [
      'a.png',
      'a.JPG',
      'a.jpeg',
      'a.gif',
      'a.webp',
      'a.ico',
      'a.bmp',
      'a.avif',
    ]) {
      expect(isPreviewableImage(path)).toBe(true)
    }
  })

  it('recognises SVG, which is also a perfectly diffable text file', () => {
    expect(isPreviewableImage('docs/logo.svg')).toBe(true)
  })

  it('rejects anything else, including a missing path', () => {
    expect(isPreviewableImage('src/png.ts')).toBe(false)
    expect(isPreviewableImage('README.md')).toBe(false)
    expect(isPreviewableImage(undefined)).toBe(false)
    expect(isPreviewableImage(null)).toBe(false)
  })
})

describe('isPreviewableMarkdown', () => {
  it('recognises the markdown extensions in use', () => {
    for (const path of ['README.md', 'a.markdown', 'a.mdown', 'a.mkdn', 'a.MDWN']) {
      expect(isPreviewableMarkdown(path)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isPreviewableMarkdown('a.mdx')).toBe(false)
    expect(isPreviewableMarkdown('a.png')).toBe(false)
    expect(isPreviewableMarkdown(undefined)).toBe(false)
  })
})

describe('hasPreviewTab', () => {
  it('covers both previewable kinds and nothing else', () => {
    expect(hasPreviewTab('a.png')).toBe(true)
    expect(hasPreviewTab('README.md')).toBe(true)
    expect(hasPreviewTab('src/a.ts')).toBe(false)
  })
})
