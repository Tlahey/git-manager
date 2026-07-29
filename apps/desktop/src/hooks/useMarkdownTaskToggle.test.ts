import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useMarkdownTaskToggle } from './useMarkdownTaskToggle'

describe('useMarkdownTaskToggle', () => {
  it('shows the rewritten body immediately and saves it', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useMarkdownTaskToggle('- [ ] todo', save))

    act(() => result.current.onTaskToggle?.('- [x] todo'))

    expect(result.current.content).toBe('- [x] todo')
    expect(result.current.pending).toBe(true)
    expect(save).toHaveBeenCalledWith('- [x] todo')

    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('falls back to the saved body once the write settles', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ content }) => useMarkdownTaskToggle(content, save),
      { initialProps: { content: '- [ ] todo' } }
    )

    act(() => result.current.onTaskToggle?.('- [x] todo'))
    // What the caller's own revalidation brings back after the PATCH.
    rerender({ content: '- [x] todo' })

    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.content).toBe('- [x] todo')
  })

  it('reverts to the source when the save fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('403'))
    const { result } = renderHook(() => useMarkdownTaskToggle('- [ ] todo', save))

    act(() => result.current.onTaskToggle?.('- [x] todo'))

    await waitFor(() => expect(result.current.content).toBe('- [ ] todo'))
    expect(result.current.pending).toBe(false)
  })

  it("offers no toggle at all when the document is not the user's to edit", () => {
    const { result } = renderHook(() => useMarkdownTaskToggle('- [ ] todo', null))

    expect(result.current.onTaskToggle).toBeUndefined()
    expect(result.current.content).toBe('- [ ] todo')
  })
})
