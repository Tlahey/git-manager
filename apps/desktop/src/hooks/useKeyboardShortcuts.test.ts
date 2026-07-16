import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useRepoUIStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../stores/repoUI.store'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { useCommandPaletteStore } from '../stores/commandPalette.store'
import { useCommitSearchStore } from '../stores/commitSearch.store'
import { useSidebarSearchStore } from '../stores/sidebarSearch.store'
import { queryClient } from '../lib/queryClient'

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

function dispatchFrom(el: Element, init: KeyboardEventInit) {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

let plainEl: HTMLDivElement
let inputEl: HTMLInputElement

beforeEach(() => {
  setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)') // non-Mac by default: ctrlKey path
  useRepoUIStore.setState({
    openTabs: [],
    activeRepo: null,
    activeTab: DASHBOARD_TAB,
    activePrNumber: null,
    activeDiffFile: null,
    prComposer: null,
    prCreateOpen: false,
  })
  useUndoHistoryStore.setState({ byRepo: {} })
  useCommandPaletteStore.setState({ open: false })
  useCommitSearchStore.setState({ open: false, query: '' })
  useSidebarSearchStore.setState({ focusToken: 0 })
  plainEl = document.createElement('div')
  inputEl = document.createElement('input')
  document.body.append(plainEl, inputEl)
})

afterEach(() => {
  plainEl.remove()
  inputEl.remove()
  vi.restoreAllMocks()
})

describe('useKeyboardShortcuts — ignoring shortcuts while typing', () => {
  it('does not open settings for Mod+, typed inside an input', () => {
    const onOpenSettings = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings, onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(inputEl, { key: ',', ctrlKey: true })
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it('still closes settings on Escape even while focused in an input', () => {
    const onCloseSettings = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings, showSettings: true })
    )
    dispatchFrom(inputEl, { key: 'Escape' })
    expect(onCloseSettings).toHaveBeenCalledOnce()
  })

  it('ignores shortcuts inside a monaco editor', () => {
    const monacoContainer = document.createElement('div')
    monacoContainer.className = 'monaco-editor'
    const inner = document.createElement('div')
    monacoContainer.appendChild(inner)
    document.body.appendChild(monacoContainer)

    const onOpenSettings = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings, onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(inner, { key: ',', ctrlKey: true })
    expect(onOpenSettings).not.toHaveBeenCalled()

    monacoContainer.remove()
  })
})

describe('useKeyboardShortcuts — Escape', () => {
  it('closes settings when shown', () => {
    const onCloseSettings = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings, showSettings: true })
    )
    dispatchFrom(plainEl, { key: 'Escape' })
    expect(onCloseSettings).toHaveBeenCalledOnce()
  })

  it('does nothing when settings are not shown', () => {
    const onCloseSettings = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings, showSettings: false })
    )
    expect(() => dispatchFrom(plainEl, { key: 'Escape' })).not.toThrow()
    expect(onCloseSettings).not.toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts — undo/redo', () => {
  it('undoes via Ctrl+Z when there is history and an active repo', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useUndoHistoryStore.setState({
      byRepo: { '/repo': { stack: [{ id: 'a' }] as never, pointer: 1 } },
    })
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(() => Promise.resolve())
    const undoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'undo').mockResolvedValue(undefined)

    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'z', ctrlKey: true })

    expect(undoSpy).toHaveBeenCalledWith('/repo')
    await vi.waitFor(() => expect(invalidateSpy).toHaveBeenCalled())
  })

  it('redoes via Ctrl+Shift+Z', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const redoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'redo').mockResolvedValue(undefined)
    vi.spyOn(useUndoHistoryStore.getState(), 'canRedo').mockReturnValue(true)

    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'Z', ctrlKey: true, shiftKey: true })

    expect(redoSpy).toHaveBeenCalledWith('/repo')
  })

  it('does not undo when Alt is also held (avoids Alt+Z conflicts)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const undoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'undo').mockResolvedValue(undefined)
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'z', ctrlKey: true, altKey: true })
    expect(undoSpy).not.toHaveBeenCalled()
  })

  it('does not undo without an active repo', () => {
    const undoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'undo').mockResolvedValue(undefined)
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'z', ctrlKey: true })
    expect(undoSpy).not.toHaveBeenCalled()
  })

  it('uses metaKey instead of ctrlKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const undoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'undo').mockResolvedValue(undefined)
    vi.spyOn(useUndoHistoryStore.getState(), 'canUndo').mockReturnValue(true)

    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'z', ctrlKey: true }) // ctrlKey alone shouldn't trigger on Mac
    expect(undoSpy).not.toHaveBeenCalled()

    dispatchFrom(plainEl, { key: 'z', metaKey: true })
    expect(undoSpy).toHaveBeenCalledWith('/repo')
  })
})

describe('useKeyboardShortcuts — tab navigation', () => {
  it('Mod+1 activates the dashboard tab', () => {
    const setActiveTabSpy = vi.spyOn(useRepoUIStore.getState(), 'setActiveTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: '1', ctrlKey: true })
    expect(setActiveTabSpy).toHaveBeenCalledWith(DASHBOARD_TAB)
  })

  it('Mod+2 activates the pull-requests tab', () => {
    const setActiveTabSpy = vi.spyOn(useRepoUIStore.getState(), 'setActiveTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: '2', ctrlKey: true })
    expect(setActiveTabSpy).toHaveBeenCalledWith(PULL_REQUESTS_TAB)
  })

  it('Mod+3 activates the first open repo tab (repo tabs are 3-indexed)', () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a', '/repo/b'] })
    const setActiveTabSpy = vi.spyOn(useRepoUIStore.getState(), 'setActiveTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: '3', ctrlKey: true })
    expect(setActiveTabSpy).toHaveBeenCalledWith('/repo/a')
  })

  it('Mod+9 with too few open tabs does nothing', () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a'] })
    const setActiveTabSpy = vi.spyOn(useRepoUIStore.getState(), 'setActiveTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: '9', ctrlKey: true })
    expect(setActiveTabSpy).not.toHaveBeenCalled()
  })

  it('works with Alt as the modifier too', () => {
    const setActiveTabSpy = vi.spyOn(useRepoUIStore.getState(), 'setActiveTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: '1', altKey: true })
    expect(setActiveTabSpy).toHaveBeenCalledWith(DASHBOARD_TAB)
  })
})

describe('useKeyboardShortcuts — settings shortcut', () => {
  it('Mod+, opens settings', () => {
    const onOpenSettings = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings, onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: ',', ctrlKey: true })
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})

describe('useKeyboardShortcuts — close tab shortcut', () => {
  it('Mod+W closes the active repo tab', () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a'], activeTab: '/repo/a' })
    const closeTabSpy = vi.spyOn(useRepoUIStore.getState(), 'closeTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'w', ctrlKey: true })
    expect(closeTabSpy).toHaveBeenCalledWith('/repo/a')
  })

  it('does not close the dashboard tab', () => {
    useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
    const closeTabSpy = vi.spyOn(useRepoUIStore.getState(), 'closeTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'w', ctrlKey: true })
    expect(closeTabSpy).not.toHaveBeenCalled()
  })

  it('does not close a tab while settings are open', () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a'], activeTab: '/repo/a' })
    const closeTabSpy = vi.spyOn(useRepoUIStore.getState(), 'closeTab')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: true,
      })
    )
    dispatchFrom(plainEl, { key: 'w', ctrlKey: true })
    expect(closeTabSpy).not.toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts — command palette (⌘K)', () => {
  it('toggles the palette open on Ctrl+K', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'k', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
  })

  it('toggles back closed on a second Ctrl+K', () => {
    useCommandPaletteStore.setState({ open: true })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'k', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('opens even while focused inside an input (handled before the typing guard)', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(inputEl, { key: 'k', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
  })

  it('does not toggle when Alt is also held', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'k', ctrlKey: true, altKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('uses metaKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'k', ctrlKey: true }) // ctrl alone shouldn't trigger on Mac
    expect(useCommandPaletteStore.getState().open).toBe(false)
    dispatchFrom(plainEl, { key: 'k', metaKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
  })
})

describe('useKeyboardShortcuts — commit search (⌘F)', () => {
  it('toggles the search panel open on Ctrl+F when a repo is active', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(true)
  })

  it('toggles back closed on a second Ctrl+F', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useCommitSearchStore.setState({ open: true })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('opens even while focused inside a plain input (handled before the typing guard)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(inputEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(true)
  })

  it('does nothing without an active repo', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('does nothing when a PR/diff/composer view is active instead of the commit graph', () => {
    useRepoUIStore.setState({ activeRepo: '/repo', activePrNumber: 42 })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('does not toggle when Alt is also held', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true, altKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('yields to Monaco when focused inside a monaco editor', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const monacoContainer = document.createElement('div')
    monacoContainer.className = 'monaco-editor'
    const inner = document.createElement('div')
    monacoContainer.appendChild(inner)
    document.body.appendChild(monacoContainer)

    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(inner, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)

    monacoContainer.remove()
  })

  it('uses metaKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true }) // ctrl alone shouldn't trigger on Mac
    expect(useCommitSearchStore.getState().open).toBe(false)
    dispatchFrom(plainEl, { key: 'f', metaKey: true })
    expect(useCommitSearchStore.getState().open).toBe(true)
  })
})

describe('useKeyboardShortcuts — sidebar search (⌥⌘F)', () => {
  it('requests focus on Ctrl+Alt+F when a repo is active', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  it('requests focus even while focused inside a plain input (handled before the typing guard)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(inputEl, { key: 'f', ctrlKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  it('does nothing without an active repo', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  it('does not fire on plain Ctrl+F (that toggles commit search instead)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  it('uses metaKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings: vi.fn(), showSettings: false })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true, altKey: true }) // ctrl alone shouldn't trigger on Mac
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
    dispatchFrom(plainEl, { key: 'f', metaKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })
})

describe('useKeyboardShortcuts — cleanup', () => {
  it('removes the keydown listener on unmount', () => {
    const onOpenSettings = vi.fn()
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings, onCloseSettings: vi.fn(), showSettings: false })
    )
    unmount()
    dispatchFrom(plainEl, { key: ',', ctrlKey: true })
    expect(onOpenSettings).not.toHaveBeenCalled()
  })
})
