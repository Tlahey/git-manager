import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@git-manager/ui', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { toast } from '@git-manager/ui'
import { copyWithToast } from './clipboard'

const mockedToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('copyWithToast', () => {
  it('writes the value to the clipboard and confirms with a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    copyWithToast('/tmp/some-path', 'Path')

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
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    copyWithToast('abc123', 'SHA')

    await vi.waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith('Failed to copy SHA'))
    expect(mockedToast.success).not.toHaveBeenCalled()
  })
})
