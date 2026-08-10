import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import type { editor } from 'monaco-editor'
import { useMonacoBackgroundSync } from './useMonacoBackgroundSync'

/** The two nodes the hook writes to, mounted so `getComputedStyle` returns real values. */
function mountTargets() {
  const root = document.createElement('div')
  const leftPaneWrapper = document.createElement('div')
  document.body.append(root, leftPaneWrapper)

  const rootRef = createRef<HTMLDivElement>() as { current: HTMLDivElement | null }
  const leftPaneWrapperRef = createRef<HTMLDivElement>() as { current: HTMLDivElement | null }
  rootRef.current = root
  leftPaneWrapperRef.current = leftPaneWrapper

  return { root, leftPaneWrapper, rootRef, leftPaneWrapperRef }
}

/** Stands in for a mounted Monaco pane: just its dom node and its dispose subscription. */
function fakeEditor(domNode: HTMLElement | null) {
  const disposeHandlers: (() => void)[] = []
  const instance = {
    getDomNode: () => domNode,
    onDidDispose: (handler: () => void) => {
      disposeHandlers.push(handler)
      return { dispose: () => {} }
    },
  } as unknown as editor.IStandaloneCodeEditor

  return { instance, dispose: () => disposeHandlers.forEach((handler) => handler()) }
}

/** MutationObserver callbacks are delivered as microtasks. */
const flushObservers = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('useMonacoBackgroundSync', () => {
  it("publishes the pane's background to both the root variable and the left padding strip", () => {
    const { root, leftPaneWrapper, rootRef, leftPaneWrapperRef } = mountTargets()
    const paneNode = document.createElement('div')
    paneNode.style.backgroundColor = 'rgb(1, 2, 3)'
    document.body.append(paneNode)

    const { result } = renderHook(() => useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef }))
    result.current(fakeEditor(paneNode).instance)

    expect(root.style.getPropertyValue('--merge-editor-background')).toBe('rgb(1, 2, 3)')
    expect(leftPaneWrapper.style.backgroundColor).toBe('rgb(1, 2, 3)')
  })

  it('re-reads the background when the theme mutates the pane, since Monaco fires no event', async () => {
    // This is the whole reason the hook observes attributes instead of syncing once: `setTheme`
    // repaints by mutating the editor's own class/style, and there is nothing to subscribe to.
    const { root, leftPaneWrapper, rootRef, leftPaneWrapperRef } = mountTargets()
    const paneNode = document.createElement('div')
    paneNode.style.backgroundColor = 'rgb(1, 2, 3)'
    document.body.append(paneNode)

    const { result } = renderHook(() => useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef }))
    result.current(fakeEditor(paneNode).instance)

    paneNode.style.backgroundColor = 'rgb(40, 44, 52)'
    await flushObservers()

    expect(root.style.getPropertyValue('--merge-editor-background')).toBe('rgb(40, 44, 52)')
    expect(leftPaneWrapper.style.backgroundColor).toBe('rgb(40, 44, 52)')
  })

  it('stops observing once the editor is disposed', async () => {
    const { root, rootRef, leftPaneWrapperRef } = mountTargets()
    const paneNode = document.createElement('div')
    paneNode.style.backgroundColor = 'rgb(1, 2, 3)'
    document.body.append(paneNode)

    const { result } = renderHook(() => useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef }))
    const pane = fakeEditor(paneNode)
    result.current(pane.instance)
    pane.dispose()

    paneNode.style.backgroundColor = 'rgb(40, 44, 52)'
    await flushObservers()

    expect(root.style.getPropertyValue('--merge-editor-background')).toBe('rgb(1, 2, 3)')
  })

  it('does nothing when the editor has no dom node yet', () => {
    const { root, rootRef, leftPaneWrapperRef } = mountTargets()

    const { result } = renderHook(() => useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef }))
    expect(() => result.current(fakeEditor(null).instance)).not.toThrow()
    expect(root.style.getPropertyValue('--merge-editor-background')).toBe('')
  })

  it('survives targets that have not been attached to the DOM', () => {
    // Pane mount can land before the wrapper refs are populated; writing to a null ref must not
    // take the resolver down with it.
    const paneNode = document.createElement('div')
    paneNode.style.backgroundColor = 'rgb(1, 2, 3)'
    document.body.append(paneNode)

    const rootRef = { current: null as HTMLDivElement | null }
    const leftPaneWrapperRef = { current: null as HTMLDivElement | null }

    const { result } = renderHook(() => useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef }))
    expect(() => result.current(fakeEditor(paneNode).instance)).not.toThrow()
  })

  it('keeps the same callback identity across renders, so panes never re-wire', () => {
    const { rootRef, leftPaneWrapperRef } = mountTargets()
    const { result, rerender } = renderHook(() =>
      useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef })
    )

    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('observes the pane node for class and style changes only', () => {
    const { rootRef, leftPaneWrapperRef } = mountTargets()
    const paneNode = document.createElement('div')
    document.body.append(paneNode)
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')

    const { result } = renderHook(() => useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef }))
    result.current(fakeEditor(paneNode).instance)

    expect(observe).toHaveBeenCalledWith(paneNode, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    observe.mockRestore()
  })
})
