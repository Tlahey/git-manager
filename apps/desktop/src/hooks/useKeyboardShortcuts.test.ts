import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useRepoUIStore, isNewTab, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../stores/repoUI.store'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { useCommandPaletteStore } from '../stores/commandPalette.store'
import { useCommitSearchStore } from '../stores/commitSearch.store'
import { useSidebarSearchStore } from '../stores/sidebarSearch.store'
import { useRepoViewStore } from '../stores/repoView.store'
import { useFileExplorerStore } from '../features/files'
import { useBoardControlsStore, useBoardDialogsStore } from '../features/board'
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
  // Vitest 4 regression workaround: `vi.restoreAllMocks()` in the afterEach below no longer
  // reliably un-wraps a `vi.spyOn(store.getState(), 'action')` spy between tests when the same
  // store action gets re-spied test after test — the next test's spy call count then still
  // carries the previous test's calls. Clearing here (before each test re-spies) keeps every
  // spy's call history scoped to its own test regardless of whether the wrapper itself persisted.
  vi.clearAllMocks()
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
  // ⌘F dispatches on the active view, so every test below states which one it is looking at.
  useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  useFileExplorerStore.setState({ treeSearchQuery: '' })
  useBoardControlsStore.setState({ boardFilter: '' })
  useBoardDialogsStore.getState().reset()
  plainEl = document.createElement('div')
  inputEl = document.createElement('input')
  document.body.append(plainEl, inputEl)
})

afterEach(() => {
  plainEl.remove()
  inputEl.remove()
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

describe('useKeyboardShortcuts — command palette (⌘K)', () => {
  it('toggles the palette open in "all" mode on Ctrl+K', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'k', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
    expect(useCommandPaletteStore.getState().mode).toBe('all')
  })
})

describe('useKeyboardShortcuts — file search palette (⌘P)', () => {
  it('toggles the palette open in "files" mode on Ctrl+P', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'p', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
    expect(useCommandPaletteStore.getState().mode).toBe('files')
  })

  it('toggles back closed on a second Ctrl+P', () => {
    useCommandPaletteStore.setState({ open: true, mode: 'files' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'p', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('opens even while focused inside an input (handled before the typing guard)', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(inputEl, { key: 'p', ctrlKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
  })

  it('does not toggle when Alt is also held', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'p', ctrlKey: true, altKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('uses metaKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'p', ctrlKey: true }) // ctrl alone shouldn't trigger on Mac
    expect(useCommandPaletteStore.getState().open).toBe(false)
    dispatchFrom(plainEl, { key: 'p', metaKey: true })
    expect(useCommandPaletteStore.getState().open).toBe(true)
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

describe('useKeyboardShortcuts — commit search (⌘F)', () => {
  it('toggles the search panel open on Ctrl+F when a repo is active', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(true)
  })

  it('toggles back closed on a second Ctrl+F', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useCommitSearchStore.setState({ open: true })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('opens even while focused inside a plain input (handled before the typing guard)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(inputEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(true)
  })

  it('does nothing without an active repo', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('does nothing when a PR/diff/composer view is active instead of the commit graph', () => {
    useRepoUIStore.setState({ activeRepo: '/repo', activePrNumber: 42 })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('does not toggle when Alt is also held', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
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
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(inner, { key: 'f', ctrlKey: true })
    expect(useCommitSearchStore.getState().open).toBe(false)

    monacoContainer.remove()
  })

  it('uses metaKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true }) // ctrl alone shouldn't trigger on Mac
    expect(useCommitSearchStore.getState().open).toBe(false)
    dispatchFrom(plainEl, { key: 'f', metaKey: true })
    expect(useCommitSearchStore.getState().open).toBe(true)
  })
})

/**
 * ⌘F means "search what I am looking at". On the files and board views that is the left panel's own
 * filter field; on the graph it is the commit search, which is a different search from the branch
 * filter ⌥⌘F raises. What makes the wrong view answering it a real bug rather than a nuisance: the
 * graph's panel over a board would search commits nobody asked about while the cards stayed
 * unfiltered.
 */
describe('useKeyboardShortcuts — ⌘F follows the active view', () => {
  function press() {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { key: 'f', ctrlKey: true })
  }

  it('asks the files panel for its filter', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'files' })
    press()
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('brings the files panel back before asking its filter for focus', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'files', isPanelOpen: false })
    press()
    expect(useRepoViewStore.getState().isPanelOpen).toBe(true)
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  /**
   * The board is the one view where ⌘F is *not* the panel's field: the panel filters the board list,
   * and looking for a ticket has no reason to start by naming its board. ⌥⌘F still reaches the
   * panel's filter here, as on the other two views.
   */
  it('opens the global ticket search on the board, not the panel’s board filter', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'board' })
    press()
    expect(useBoardDialogsStore.getState().openDialog).toBe('globalSearch')
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  it('opens the commit search on the graph, and nobody else’s', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    press()
    expect(useCommitSearchStore.getState().open).toBe(true)
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  /**
   * `isCommitsView` gates the graph alone: its panel only exists over the plain commit list. The
   * other two views draw their filter unconditionally, so a PR open in the centre slot — which
   * belongs to the graph — must not stop the board from answering ⌘F.
   */
  it('still answers on the board while a pull request occupies the graph’s centre slot', () => {
    useRepoUIStore.setState({ activeRepo: '/repo', activePrNumber: 42 })
    useRepoViewStore.setState({ view: 'board' })
    press()
    expect(useBoardDialogsStore.getState().openDialog).toBe('globalSearch')
  })
})

describe('useKeyboardShortcuts — left panel (⌘S)', () => {
  function press(from: Element = plainEl, init: KeyboardEventInit = {}) {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(from, { key: 's', ctrlKey: true, ...init })
  }

  it('folds the panel away and back', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    press()
    expect(useRepoViewStore.getState().isPanelOpen).toBe(false)
  })

  /** Whichever view is filling the slot — one flag, one gesture. */
  it('answers on the board as much as on the graph', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'board' })
    press()
    expect(useRepoViewStore.getState().isPanelOpen).toBe(false)
  })

  it('works while a field has focus, like the other chords handled before the typing guard', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    press(inputEl)
    expect(useRepoViewStore.getState().isPanelOpen).toBe(false)
  })

  /**
   * ⌘S is muscle memory for "save" inside an editor. There is nothing to save in this app, which is
   * what makes the key free — but swallowing it over a Monaco pane would read as the app ignoring a
   * save rather than as a shortcut it doesn't have.
   */
  it('yields to Monaco', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const monaco = document.createElement('div')
    monaco.className = 'monaco-editor'
    const inner = document.createElement('div')
    monaco.append(inner)
    document.body.append(monaco)

    press(inner)
    expect(useRepoViewStore.getState().isPanelOpen).toBe(true)

    monaco.remove()
  })

  it('does nothing without an active repo, where there is no panel to fold', () => {
    press()
    expect(useRepoViewStore.getState().isPanelOpen).toBe(true)
  })
})

describe('useKeyboardShortcuts — sidebar search (⌥⌘F)', () => {
  /** Filtering a panel that ⌘S folded away is asking for it back — otherwise the chord would ask an
   * unmounted input for focus and do nothing visible at all. */
  it('brings the panel back first when it is hidden', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ isPanelOpen: false })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { code: 'KeyF', ctrlKey: true, altKey: true })
    expect(useRepoViewStore.getState().isPanelOpen).toBe(true)
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  it('requests focus on Ctrl+Alt+F when a repo is active', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { code: 'KeyF', ctrlKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  it('requests focus even while focused inside a plain input (handled before the typing guard)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(inputEl, { code: 'KeyF', ctrlKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  it('does nothing without an active repo', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { code: 'KeyF', ctrlKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  it('does not fire on plain Ctrl+F (that toggles commit search instead)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { code: 'KeyF', key: 'f', ctrlKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  it('uses metaKey on a Mac user agent', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    dispatchFrom(plainEl, { code: 'KeyF', ctrlKey: true, altKey: true }) // ctrl alone shouldn't trigger on Mac
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
    dispatchFrom(plainEl, { code: 'KeyF', metaKey: true, altKey: true })
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
  })

  it('fires on the real macOS Option+F keypress, where e.key is the composed "ƒ" character, not "f"', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() =>
      useKeyboardShortcuts({
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        showSettings: false,
      })
    )
    // What macOS actually reports for a physical Option+Cmd+F keypress on a US layout.
    dispatchFrom(plainEl, { code: 'KeyF', key: 'ƒ', metaKey: true, altKey: true })
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

describe('useKeyboardShortcuts — new tab (Ctrl/⌘ + T)', () => {
  function renderShortcuts(showSettings = false, onCloseSettings = vi.fn()) {
    renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings: vi.fn(), onCloseSettings, showSettings })
    )
  }

  it('opens an empty tab and focuses it', () => {
    renderShortcuts()
    dispatchFrom(plainEl, { key: 't', ctrlKey: true })
    const state = useRepoUIStore.getState()
    expect(state.openTabs).toHaveLength(1)
    expect(isNewTab(state.activeTab)).toBe(true)
  })

  it('works while typing in an input (handled before the input guard)', () => {
    renderShortcuts()
    dispatchFrom(inputEl, { key: 't', ctrlKey: true })
    expect(useRepoUIStore.getState().openTabs).toHaveLength(1)
  })

  it('accepts ⌘T on macOS', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    renderShortcuts()
    dispatchFrom(plainEl, { key: 't', metaKey: true })
    expect(useRepoUIStore.getState().openTabs).toHaveLength(1)
  })

  it('accepts Ctrl+T on macOS too', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    renderShortcuts()
    dispatchFrom(plainEl, { key: 't', ctrlKey: true })
    expect(useRepoUIStore.getState().openTabs).toHaveLength(1)
  })

  it('ignores a bare T with no modifier', () => {
    renderShortcuts()
    dispatchFrom(plainEl, { key: 't' })
    expect(useRepoUIStore.getState().openTabs).toEqual([])
  })

  it('closes the settings screen so the new tab is actually visible', () => {
    const onCloseSettings = vi.fn()
    renderShortcuts(true, onCloseSettings)
    dispatchFrom(plainEl, { key: 't', ctrlKey: true })
    expect(onCloseSettings).toHaveBeenCalled()
    expect(useRepoUIStore.getState().openTabs).toHaveLength(1)
  })
})
