import { describe, it, expect } from 'vitest'
import {
  attachmentKind,
  attachmentMarkdown,
  attachmentUrl,
  insertAtCaret,
  rawContentUrlPrefix,
} from './attachmentMarkdown'

const PATH = '.git-manager/attachments/abc123def456.png'

describe('attachmentKind', () => {
  it('recognises images and videos, case-insensitively', () => {
    expect(attachmentKind('shot.PNG')).toBe('image')
    expect(attachmentKind('clip.mp4')).toBe('video')
    expect(attachmentKind('recording.MOV')).toBe('video')
  })

  it('falls back to a plain file for anything else', () => {
    expect(attachmentKind('notes.pdf')).toBe('file')
    expect(attachmentKind('noextension')).toBe('file')
  })
})

describe('attachmentUrl', () => {
  it('leaves the path relative for a local board', () => {
    expect(attachmentUrl(PATH)).toBe(PATH)
  })

  it('absolutises it against the raw prefix for a remote board', () => {
    const prefix = rawContentUrlPrefix('Tlahey', 'git-manager', 'main')
    expect(attachmentUrl(PATH, prefix)).toBe(
      'https://raw.githubusercontent.com/Tlahey/git-manager/main/.git-manager/attachments/abc123def456.png'
    )
  })

  it('does not double up slashes', () => {
    expect(attachmentUrl('./x.png', 'https://example.com/base/')).toBe('https://example.com/base/x.png')
  })
})

describe('attachmentMarkdown', () => {
  it('embeds an image with markdown syntax', () => {
    expect(attachmentMarkdown(PATH, 'screenshot.png')).toBe(`![screenshot](${PATH})`)
  })

  it('embeds a video with raw HTML, since markdown has no video syntax', () => {
    const snippet = attachmentMarkdown('.git-manager/attachments/x.mp4', 'demo.mp4')
    expect(snippet).toBe('<video src=".git-manager/attachments/x.mp4" controls></video>')
  })

  it('links anything else by its full filename', () => {
    expect(attachmentMarkdown('.git-manager/attachments/x.pdf', 'spec.pdf')).toBe(
      '[spec.pdf](.git-manager/attachments/x.pdf)'
    )
  })

  it('uses the absolute URL for a remote board, so github.com renders it too', () => {
    const prefix = rawContentUrlPrefix('o', 'r', 'main')
    expect(attachmentMarkdown(PATH, 'shot.png', prefix)).toBe(
      `![shot](https://raw.githubusercontent.com/o/r/main/${PATH})`
    )
  })
})

describe('insertAtCaret', () => {
  it('inserts into an empty field without adding stray newlines', () => {
    expect(insertAtCaret('', '![a](b)', 0, 0)).toEqual({ value: '![a](b)', caret: 7 })
  })

  it('puts the snippet on its own line after existing text', () => {
    const { value } = insertAtCaret('Some notes', '![a](b)', 10, 10)
    expect(value).toBe('Some notes\n![a](b)')
  })

  it('separates it from text that follows the caret', () => {
    const { value } = insertAtCaret('before after', '![a](b)', 6, 6)
    // The user's own spacing either side of the caret is preserved, not tidied away.
    expect(value).toBe('before\n![a](b)\n after')
  })

  it('replaces the selection rather than inserting beside it', () => {
    const { value } = insertAtCaret('keep DROP keep', 'X', 5, 9)
    expect(value).toBe('keep \nX\n keep')
    expect(value).not.toContain('DROP')
  })

  it('leaves the caret after the inserted snippet', () => {
    const { value, caret } = insertAtCaret('a', 'XY', 1, 1)
    expect(value.slice(0, caret)).toBe('a\nXY')
  })
})
