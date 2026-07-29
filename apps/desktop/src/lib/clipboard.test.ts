import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@git-manager/ui', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { toast } from '@git-manager/ui'
import { i18next } from '@git-manager/i18n'
import { copyWithToast } from './clipboard'

const mockedToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
}

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('copyWithToast', () => {
  it('writes the value to the clipboard and confirms with a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    copyWithToast('/tmp/some-path', 'path')

    expect(writeText).toHaveBeenCalledWith('/tmp/some-path')
    await vi.waitFor(() =>
      expect(mockedToast.success).toHaveBeenCalledWith('Path copied to clipboard', {
        description: '/tmp/some-path',
      })
    )
    expect(mockedToast.error).not.toHaveBeenCalled()
  })

  it('reports a failed clipboard write with an error toast', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard(writeText)

    copyWithToast('abc123', 'sha')

    await vi.waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith('Could not copy SHA'))
    expect(mockedToast.success).not.toHaveBeenCalled()
  })

  // SHA is on the repo's intentionally-untranslated list, so it reads the same in both locales —
  // but it still goes through a key, so the surrounding sentence is the one that changes.
  it('names the copied kind in the active language', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    await i18next.changeLanguage('fr')

    try {
      copyWithToast('/tmp/some-path', 'path')

      await vi.waitFor(() =>
        expect(mockedToast.success).toHaveBeenCalledWith('Chemin copié dans le presse-papiers', {
          description: '/tmp/some-path',
        })
      )
    } finally {
      await i18next.changeLanguage('en')
    }
  })
})
