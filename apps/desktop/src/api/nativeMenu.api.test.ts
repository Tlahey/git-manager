import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  resolveResource,
  imageNew,
  imageFromPath,
  getCurrentWindow,
  windowTheme,
  menuNew,
  menuPopup,
  menuItemNew,
  iconMenuItemNew,
  submenuNew,
  predefinedMenuItemNew,
} = vi.hoisted(() => {
  const menuPopup = vi.fn(async () => {})
  return {
    resolveResource: vi.fn(async (p: string) => `/resources/${p}`),
    imageNew: vi.fn(async (rgba: Uint8Array, width: number, height: number) => ({
      __rgba: rgba,
      __w: width,
      __h: height,
    })),
    imageFromPath: vi.fn(async (path: string) => ({
      __path: path,
      size: async () => ({ width: 2, height: 1 }),
      rgba: async () => new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]),
    })),
    getCurrentWindow: vi.fn(),
    windowTheme: vi.fn(async () => 'light'),
    menuPopup,
    menuNew: vi.fn(async (opts: unknown) => ({
      __kind: 'Menu',
      ...(opts as object),
      popup: menuPopup,
    })),
    menuItemNew: vi.fn(async (opts: unknown) => ({ __kind: 'MenuItem', ...(opts as object) })),
    iconMenuItemNew: vi.fn(async (opts: unknown) => ({
      __kind: 'IconMenuItem',
      ...(opts as object),
    })),
    submenuNew: vi.fn(async (opts: unknown) => ({ __kind: 'Submenu', ...(opts as object) })),
    predefinedMenuItemNew: vi.fn(async (opts: unknown) => ({
      __kind: 'PredefinedMenuItem',
      ...(opts as object),
    })),
  }
})

vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: (...a: [string]) => resolveResource(...a),
}))
vi.mock('@tauri-apps/api/image', () => ({
  Image: {
    new: (...a: [Uint8Array, number, number]) => imageNew(...a),
    fromPath: (...a: [string]) => imageFromPath(...a),
  },
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: (...a: unknown[]) => getCurrentWindow(...a),
}))
vi.mock('@tauri-apps/api/menu', () => ({
  Menu: { new: (...a: [unknown]) => menuNew(...a) },
  MenuItem: { new: (...a: [unknown]) => menuItemNew(...a) },
  IconMenuItem: { new: (...a: [unknown]) => iconMenuItemNew(...a) },
  Submenu: { new: (...a: [unknown]) => submenuNew(...a) },
  PredefinedMenuItem: { new: (...a: [unknown]) => predefinedMenuItemNew(...a) },
}))

type NativeMenuModule = typeof import('./nativeMenu.api')

function commitLabels(): import('./nativeMenu.api').CommitNativeMenuLabels {
  return {
    checkout: 'Checkout',
    createWorktree: 'Create Worktree',
    createBranch: 'Create Branch',
    cherryPick: 'Cherry-pick',
    rebaseOnto: 'Rebase onto',
    resetSubmenu: 'Reset',
    resetSoft: 'Soft',
    resetMixed: 'Mixed',
    resetHard: 'Hard',
    undoCommit: 'Undo commit',
    revert: 'Revert',
    fixup: 'Fixup',
    recompose: 'Recompose',
    interactiveRebase: 'Interactive rebase',
    editMessage: 'Edit message',
    drop: 'Drop',
    moveUp: 'Move up',
    moveDown: 'Move down',
    copySha: 'Copy SHA',
    copyLink: 'Copy link',
    createPatch: 'Create patch',
    compareToWorkdir: 'Compare to workdir',
    createTag: 'Create tag',
    createAnnotatedTag: 'Create annotated tag',
    selectedCount: '3 selected',
  }
}

function commitOpts(
  overrides: Partial<Parameters<NativeMenuModule['showCommitNativeContextMenu']>[0]> = {}
) {
  return {
    isSingle: true,
    fixupEnabled: true,
    undoCommitEnabled: true,
    targetCount: 1,
    labels: commitLabels(),
    onCheckout: vi.fn(),
    onCreateWorktree: vi.fn(),
    onCreateBranch: vi.fn(),
    onCherryPick: vi.fn(),
    onRebaseOnto: vi.fn(),
    onReset: vi.fn(),
    onUndoCommit: vi.fn(),
    onRevert: vi.fn(),
    onFixup: vi.fn(),
    onCopySha: vi.fn(),
    onCopyLink: vi.fn(),
    onCreatePatch: vi.fn(),
    onCompareToWorkdir: vi.fn(),
    onCreateTag: vi.fn(),
    onCreateAnnotatedTag: vi.fn(),
    ...overrides,
  }
}

async function freshApi(): Promise<NativeMenuModule> {
  vi.resetModules()
  return import('./nativeMenu.api')
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentWindow.mockReturnValue({ theme: windowTheme })
  windowTheme.mockResolvedValue('light')
  resolveResource.mockImplementation(async (p: string) => `/resources/${p}`)
  imageFromPath.mockImplementation(async (path: string) => ({
    __path: path,
    size: async () => ({ width: 2, height: 1 }),
    rgba: async () => new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('icon loading', () => {
  it('resolves and loads every declared icon resource on first use', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts())
    expect(resolveResource).toHaveBeenCalledWith('icons/menu/copy_sha.png')
    expect(resolveResource).toHaveBeenCalledWith('icons/menu/branch.png')
    expect(resolveResource).toHaveBeenCalledWith('icons/menu/tag.png')
    expect(resolveResource).toHaveBeenCalledWith('icons/menu/reset.png')
    expect(resolveResource).toHaveBeenCalledWith('icons/menu/revert.png')
    expect(resolveResource).toHaveBeenCalledWith('icons/menu/fixup.png')
    expect(resolveResource).toHaveBeenCalledTimes(6)
  })

  it('only loads icons once across multiple menu builds', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts())
    await api.showBranchNativeContextMenu({ isHead: false, onDelete: vi.fn() })
    expect(resolveResource).toHaveBeenCalledTimes(6)
  })

  it('warns but keeps building the menu when one icon fails to resolve', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveResource.mockImplementation(async (p: string) => {
      if (p.includes('branch')) throw new Error('missing resource')
      return `/resources/${p}`
    })
    const api = await freshApi()
    await expect(api.showCommitNativeContextMenu(commitOpts())).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    expect(menuNew).toHaveBeenCalled()
  })
})

describe('icon tinting by theme/enabled state', () => {
  function iconArgOf(text: string) {
    const call = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === text
    )
    return call?.[0] as { icon?: { __rgba?: Uint8Array; __path?: string } } | undefined
  }

  it('uses the plain resolved icon in light mode when enabled', async () => {
    windowTheme.mockResolvedValue('light')
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ isSingle: true }))
    const arg = iconArgOf('Copy SHA')
    expect(arg?.icon?.__path).toBe('/resources/icons/menu/copy_sha.png')
  })

  it('uses the white-tinted icon in dark mode when enabled', async () => {
    windowTheme.mockResolvedValue('dark')
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ isSingle: true }))
    const arg = iconArgOf('Copy SHA')
    expect(arg?.icon?.__rgba?.[0]).toBe(255)
  })

  it('uses the grey-tinted icon when disabled, regardless of theme', async () => {
    windowTheme.mockResolvedValue('dark')
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ isSingle: false }))
    const arg = iconArgOf('Copy SHA')
    expect(arg?.icon?.__rgba?.[0]).toBe(142)
  })
})

describe('showCommitNativeContextMenu — structure', () => {
  it('adds a disabled header item + separator only for multi-select (targetCount > 1)', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ targetCount: 3 }))
    expect(menuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: '3 selected', enabled: false })
    )
  })

  it('omits the header for a single target', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ targetCount: 1 }))
    expect(menuItemNew).not.toHaveBeenCalledWith(expect.objectContaining({ text: '3 selected' }))
  })

  it('disables single-target-only items when isSingle is false', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ isSingle: false }))
    // Every makeItem()-built entry becomes an IconMenuItem (even text-only ones get the
    // transparent blank placeholder icon for alignment) — plain MenuItem.new is only used
    // directly for the multi-select header, never via makeItem.
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Checkout', enabled: false })
    )
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Cherry-pick', enabled: false })
    )
    expect(submenuNew).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('enables single-target-only items when isSingle is true', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ isSingle: true }))
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Checkout', enabled: true })
    )
  })

  it('governs the undo-commit item by undoCommitEnabled', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ undoCommitEnabled: false }))
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Undo commit', enabled: false })
    )
  })

  it('governs the fixup item by fixupEnabled', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ fixupEnabled: false }))
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Fixup', enabled: false })
    )
  })

  it('wires the checkout item action to onCheckout', async () => {
    const onCheckout = vi.fn()
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ onCheckout }))
    const call = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Checkout'
    )
    ;(call![0] as { action: () => void }).action()
    expect(onCheckout).toHaveBeenCalledOnce()
  })

  it('builds the reset submenu with soft/mixed/hard items wired to onReset', async () => {
    const onReset = vi.fn()
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts({ onReset }))

    const softCall = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Soft'
    )
    const mixedCall = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Mixed'
    )
    const hardCall = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Hard'
    )
    ;(softCall![0] as { action: () => void }).action()
    ;(mixedCall![0] as { action: () => void }).action()
    ;(hardCall![0] as { action: () => void }).action()

    expect(onReset).toHaveBeenNthCalledWith(1, 'soft')
    expect(onReset).toHaveBeenNthCalledWith(2, 'mixed')
    expect(onReset).toHaveBeenNthCalledWith(3, 'hard')

    const submenuCall = submenuNew.mock.calls[0][0] as { items: unknown[] }
    expect(submenuCall.items).toHaveLength(3)
  })

  it('renders deferred (not-yet-implemented) items disabled with no action', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts())
    const call = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Drop'
    )
    expect(call?.[0]).toMatchObject({ text: 'Drop', enabled: false })
  })

  it('builds and pops up the assembled menu', async () => {
    const api = await freshApi()
    await api.showCommitNativeContextMenu(commitOpts())
    expect(menuNew).toHaveBeenCalledOnce()
    expect(menuPopup).toHaveBeenCalledOnce()
  })

  it('logs and does not throw when building/popping the menu fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    menuNew.mockRejectedValueOnce(new Error('native menu failure'))
    const api = await freshApi()
    await expect(api.showCommitNativeContextMenu(commitOpts())).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('showStashNativeContextMenu', () => {
  it('labels the visibility toggle based on isHidden', async () => {
    const api = await freshApi()
    await api.showStashNativeContextMenu({
      isHidden: true,
      onApply: vi.fn(),
      onPop: vi.fn(),
      onDelete: vi.fn(),
      onEditMessage: vi.fn(),
      onToggleVisibility: vi.fn(),
    })
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Show the stash' })
    )
  })

  it('labels the visibility toggle as "Hide" when not hidden', async () => {
    const api = await freshApi()
    await api.showStashNativeContextMenu({
      isHidden: false,
      onApply: vi.fn(),
      onPop: vi.fn(),
      onDelete: vi.fn(),
      onEditMessage: vi.fn(),
      onToggleVisibility: vi.fn(),
    })
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hide the stash' })
    )
  })

  it('wires each action to its callback', async () => {
    const onDelete = vi.fn()
    const api = await freshApi()
    await api.showStashNativeContextMenu({
      isHidden: false,
      onApply: vi.fn(),
      onPop: vi.fn(),
      onDelete,
      onEditMessage: vi.fn(),
      onToggleVisibility: vi.fn(),
    })
    const call = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Delete stash'
    )
    ;(call![0] as { action: () => void }).action()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('builds and pops up the menu', async () => {
    const api = await freshApi()
    await api.showStashNativeContextMenu({
      isHidden: false,
      onApply: vi.fn(),
      onPop: vi.fn(),
      onDelete: vi.fn(),
      onEditMessage: vi.fn(),
      onToggleVisibility: vi.fn(),
    })
    expect(menuNew).toHaveBeenCalledOnce()
    expect(menuPopup).toHaveBeenCalledOnce()
  })
})

describe('showBranchNativeContextMenu', () => {
  it('disables deletion for the current (HEAD) branch', async () => {
    const api = await freshApi()
    await api.showBranchNativeContextMenu({ isHead: true, onDelete: vi.fn() })
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Delete branch', enabled: false })
    )
  })

  it('enables deletion for a non-HEAD branch', async () => {
    const api = await freshApi()
    await api.showBranchNativeContextMenu({ isHead: false, onDelete: vi.fn() })
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Delete branch', enabled: true })
    )
  })

  it('wires the delete action to the callback', async () => {
    const onDelete = vi.fn()
    const api = await freshApi()
    await api.showBranchNativeContextMenu({ isHead: false, onDelete })
    const call = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Delete branch'
    )
    ;(call![0] as { action: () => void }).action()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('builds and pops up the menu', async () => {
    const api = await freshApi()
    await api.showBranchNativeContextMenu({ isHead: false, onDelete: vi.fn() })
    expect(menuNew).toHaveBeenCalledOnce()
    expect(menuPopup).toHaveBeenCalledOnce()
  })
})

describe('showRefDropNativeContextMenu', () => {
  function refDropOpts(
    overrides: Partial<Parameters<NativeMenuModule['showRefDropNativeContextMenu']>[0]> = {}
  ) {
    return {
      labels: {
        fastForward: 'Fast-forward main to feat',
        merge: 'Merge feat into main',
        rebase: 'Rebase feat onto main',
        interactiveRebase: 'Interactive Rebase feat onto main',
        push: 'Push feat to origin/main',
        resetSubmenu: 'Reset feat to this commit',
        resetSoft: 'Soft',
        resetMixed: 'Mixed',
        resetHard: 'Hard',
        startPr: 'Start a pull request to origin/main from origin/feat',
      },
      fastForwardEnabled: true,
      mergeEnabled: true,
      rebaseEnabled: true,
      interactiveRebaseEnabled: true,
      pushEnabled: true,
      resetEnabled: true,
      prEnabled: true,
      onFastForward: vi.fn(),
      onMerge: vi.fn(),
      onRebase: vi.fn(),
      onInteractiveRebase: vi.fn(),
      onPush: vi.fn(),
      onReset: vi.fn(),
      onStartPr: vi.fn(),
      ...overrides,
    }
  }

  it('renders all seven actions with the provided labels', async () => {
    const api = await freshApi()
    await api.showRefDropNativeContextMenu(refDropOpts())
    for (const text of [
      'Fast-forward main to feat',
      'Merge feat into main',
      'Rebase feat onto main',
      'Interactive Rebase feat onto main',
      'Push feat to origin/main',
      'Start a pull request to origin/main from origin/feat',
    ]) {
      expect(iconMenuItemNew).toHaveBeenCalledWith(expect.objectContaining({ text }))
    }
    expect(submenuNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Reset feat to this commit' })
    )
  })

  it('disables actions per the *Enabled flags', async () => {
    const api = await freshApi()
    await api.showRefDropNativeContextMenu(
      refDropOpts({ fastForwardEnabled: false, mergeEnabled: false, resetEnabled: false })
    )
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Fast-forward main to feat', enabled: false })
    )
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Merge feat into main', enabled: false })
    )
    expect(submenuNew).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('wires the reset submenu soft/mixed/hard to onReset', async () => {
    const onReset = vi.fn()
    const api = await freshApi()
    await api.showRefDropNativeContextMenu(refDropOpts({ onReset }))
    for (const [text] of [['Soft'], ['Mixed'], ['Hard']]) {
      const call = iconMenuItemNew.mock.calls.find(
        ([opts]) => (opts as { text: string }).text === text
      )
      ;(call![0] as { action: () => void }).action()
    }
    expect(onReset).toHaveBeenNthCalledWith(1, 'soft')
    expect(onReset).toHaveBeenNthCalledWith(2, 'mixed')
    expect(onReset).toHaveBeenNthCalledWith(3, 'hard')
  })

  it('wires the fast-forward and start-PR actions to their callbacks', async () => {
    const onFastForward = vi.fn()
    const onStartPr = vi.fn()
    const api = await freshApi()
    await api.showRefDropNativeContextMenu(refDropOpts({ onFastForward, onStartPr }))
    const ff = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Fast-forward main to feat'
    )
    const pr = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Start a pull request to origin/main from origin/feat'
    )
    ;(ff![0] as { action: () => void }).action()
    ;(pr![0] as { action: () => void }).action()
    expect(onFastForward).toHaveBeenCalledOnce()
    expect(onStartPr).toHaveBeenCalledOnce()
  })

  it('builds and pops up the assembled menu', async () => {
    const api = await freshApi()
    await api.showRefDropNativeContextMenu(refDropOpts())
    expect(menuNew).toHaveBeenCalledOnce()
    expect(menuPopup).toHaveBeenCalledOnce()
  })
})
