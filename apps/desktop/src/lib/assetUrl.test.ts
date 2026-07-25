import { describe, it, expect, vi, afterEach } from 'vitest'
import { joinRepoPath, toAssetUrl } from './assetUrl'

const { convertFileSrc } = vi.hoisted(() => ({ convertFileSrc: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('joinRepoPath', () => {
  it('joins a repository and a repo-relative path', () => {
    expect(joinRepoPath('/Users/me/repo', 'docs/logo.png')).toBe('/Users/me/repo/docs/logo.png')
  })

  it('tolerates a trailing slash on the repository path', () => {
    expect(joinRepoPath('/Users/me/repo/', 'docs/logo.png')).toBe('/Users/me/repo/docs/logo.png')
    expect(joinRepoPath('/Users/me/repo//', 'docs/logo.png')).toBe('/Users/me/repo/docs/logo.png')
  })

  it('strips a leading "./" or "/" from the relative path', () => {
    expect(joinRepoPath('/repo', './docs/logo.png')).toBe('/repo/docs/logo.png')
    expect(joinRepoPath('/repo', '/docs/logo.png')).toBe('/repo/docs/logo.png')
  })
})

describe('toAssetUrl', () => {
  it('delegates to Tauri inside the webview', () => {
    convertFileSrc.mockReturnValue('asset://localhost/repo/logo.png')
    expect(toAssetUrl('/repo/logo.png')).toBe('asset://localhost/repo/logo.png')
    expect(convertFileSrc).toHaveBeenCalledWith('/repo/logo.png')
  })

  it('falls back to a file:// URL where Tauri internals are absent, instead of throwing', () => {
    convertFileSrc.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'convertFileSrc')")
    })
    expect(toAssetUrl('/repo/logo.png')).toBe('file:///repo/logo.png')
  })
})
