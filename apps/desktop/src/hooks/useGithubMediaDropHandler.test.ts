import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DragEvent } from 'react'
import { useGithubMediaDropHandler } from './useGithubMediaDropHandler'

const toastInfo = vi.fn()
vi.mock('@git-manager/ui', () => ({
  toast: { info: (...a: unknown[]) => toastInfo(...a) },
}))

const openUrl = vi.fn()
vi.mock('../lib/openUrl', () => ({
  openUrl: (...a: unknown[]) => openUrl(...a),
}))

function dropEvent(files: Array<{ type: string }>): DragEvent<HTMLTextAreaElement> {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types: files.length ? ['Files'] : [], files },
  } as unknown as DragEvent<HTMLTextAreaElement>
}

describe('useGithubMediaDropHandler', () => {
  beforeEach(() => {
    toastInfo.mockClear()
    openUrl.mockClear()
  })

  it('ignores a drop carrying no image/video file, leaving native text-drop behavior intact', () => {
    const { result } = renderHook(() => useGithubMediaDropHandler('https://github.com/o/r/pull/1'))
    const event = dropEvent([{ type: 'text/plain' }])

    result.current.onDrop(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(openUrl).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('opens the GitHub URL and explains why when an image is dropped', () => {
    const { result } = renderHook(() => useGithubMediaDropHandler('https://github.com/o/r/pull/1'))
    const event = dropEvent([{ type: 'image/png' }])

    result.current.onDrop(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/1')
    expect(toastInfo).toHaveBeenCalledWith(
      "GitHub doesn't support uploading images or videos from here — opening your browser so you can drop it there."
    )
  })

  it('treats a dropped video file the same as an image', () => {
    const { result } = renderHook(() => useGithubMediaDropHandler('https://github.com/o/r/pull/1'))
    const event = dropEvent([{ type: 'video/mp4' }])

    result.current.onDrop(event)

    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/1')
  })

  it('only explains, without opening a browser, when no GitHub URL exists yet', () => {
    const { result } = renderHook(() => useGithubMediaDropHandler(null))
    const event = dropEvent([{ type: 'image/png' }])

    result.current.onDrop(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(openUrl).not.toHaveBeenCalled()
    expect(toastInfo).toHaveBeenCalledWith(
      "GitHub doesn't support uploading images or videos from here. You'll be able to add it directly on GitHub once this is created."
    )
  })

  it('allows the drop only when the drag actually carries files', () => {
    const { result } = renderHook(() => useGithubMediaDropHandler('https://github.com/o/r/pull/1'))

    const withFiles = dropEvent([{ type: 'image/png' }])
    result.current.onDragOver(withFiles)
    expect(withFiles.preventDefault).toHaveBeenCalled()

    const withoutFiles = dropEvent([])
    result.current.onDragOver(withoutFiles)
    expect(withoutFiles.preventDefault).not.toHaveBeenCalled()
  })
})
