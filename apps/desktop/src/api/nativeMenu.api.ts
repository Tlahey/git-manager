import { Menu, MenuItem, IconMenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { resolveResource } from '@tauri-apps/api/path'
import { Image } from '@tauri-apps/api/image'

// ── Icon resolution ──────────────────────────────────────────────────────────
// Icons are bundled as resources in src-tauri/icons/menu/*.png and resolved
// at runtime.

// Only names with a bundled PNG resource go here — items without one fall back to the
// transparent blank spacer (see `makeItem`) rather than logging a resolve failure on every load.
const ICON_NAMES = ['copy_sha', 'branch', 'tag', 'reset', 'revert', 'fixup'] as const
type IconName = typeof ICON_NAMES[number]

let resolvedIcons: Partial<Record<IconName, Image>> = {}
let blankImg: Image | undefined
let hasAttemptedResolve = false

/**
 * Resolves all menu icon paths and loads them into Tauri Image instances.
 * Also generates a transparent blank Image in memory to use as a fallback alignment placeholder.
 */
async function loadIcons(): Promise<void> {
  if (hasAttemptedResolve) return
  hasAttemptedResolve = true

  // 1. Generate transparent placeholder in memory (20x20 pixels)
  try {
    const rgba = new Uint8Array(20 * 20 * 4) // All zeros = transparent
    blankImg = await Image.new(rgba, 20, 20)
  } catch (err) {
    console.error('[nativeMenu] Failed to generate in-memory blank placeholder:', err)
  }

  // 2. Load custom icons from resources
  await Promise.all(
    ICON_NAMES.map(async (name) => {
      try {
        const path = await resolveResource(`icons/menu/${name}.png`)
        const img = await Image.fromPath(path)
        resolvedIcons[name] = img
      } catch (err) {
        console.warn(`[nativeMenu] Failed to load icon "${name}":`, err)
      }
    }),
  )
}

async function makeItem(
  opts: {
    text: string
    icon?: IconName
    enabled?: boolean
    action?: () => void
  }
): Promise<MenuItem | IconMenuItem> {
  const { text, icon, enabled = true, action } = opts
  
  // Use the loaded icon or fall back to the transparent blank placeholder image to align items
  const img = (icon ? resolvedIcons[icon] : undefined) || blankImg

  if (img) {
    try {
      return await IconMenuItem.new({ text, icon: img, enabled, action })
    } catch (err) {
      console.warn(`[nativeMenu] Failed to create IconMenuItem for "${text}":`, err)
    }
  }
  return MenuItem.new({ text, enabled, action })
}

export interface CommitNativeMenuLabels {
  checkout: string
  createWorktree: string
  createBranch: string
  cherryPick: string
  rebaseOnto: string
  resetSubmenu: string
  resetSoft: string
  resetMixed: string
  resetHard: string
  revert: string
  fixup: string
  recompose: string
  interactiveRebase: string
  editMessage: string
  drop: string
  moveUp: string
  moveDown: string
  copySha: string
  copyLink: string
  createPatch: string
  compareToWorkdir: string
  createTag: string
  createAnnotatedTag: string
  selectedCount: string
}

export interface CommitNativeMenuOptions {
  isSingle: boolean
  /** Enable the fixup item only when the target is a single commit on the current branch. */
  fixupEnabled: boolean
  targetCount: number
  labels: CommitNativeMenuLabels
  onCheckout: () => void
  onCreateWorktree: () => void
  onCreateBranch: () => void
  onCherryPick: () => void
  onRebaseOnto: () => void
  onReset: (mode: 'soft' | 'mixed' | 'hard') => void
  onRevert: () => void
  onFixup: () => void
  onCopySha: () => void
  onCopyLink: () => void
  onCreatePatch: () => void
  onCompareToWorkdir: () => void
  onCreateTag: () => void
  onCreateAnnotatedTag: () => void
}

/**
 * Builds and pops up a native macOS context menu for commit actions.
 * Uses Tauri v2's built-in Menu API with bundled PNG icons resolved at runtime.
 * Item text is passed in pre-translated via `labels` — this module has no React/i18n context.
 */
export async function showCommitNativeContextMenu(opts: CommitNativeMenuOptions): Promise<void> {
  const {
    isSingle,
    fixupEnabled,
    targetCount,
    labels,
    onCheckout,
    onCreateWorktree,
    onCreateBranch,
    onCherryPick,
    onRebaseOnto,
    onReset,
    onRevert,
    onFixup,
    onCopySha,
    onCopyLink,
    onCreatePatch,
    onCompareToWorkdir,
    onCreateTag,
    onCreateAnnotatedTag,
  } = opts

  // Ensure icons are loaded (noop after first call)
  try {
    await loadIcons()
  } catch (err) {
    console.error('[nativeMenu] Error loading icons:', err)
  }

  // ── Header (multi-select count) ───────────────────────────────────────────
  const header = targetCount > 1
    ? await MenuItem.new({ text: labels.selectedCount, enabled: false })
    : null

  // ── Items ─────────────────────────────────────────────────────────────────
  const checkoutItem   = await makeItem({ text: labels.checkout,       enabled: isSingle, action: () => onCheckout() })
  const worktreeItem   = await makeItem({ text: labels.createWorktree, enabled: isSingle, action: () => onCreateWorktree() })
  const createBranch   = await makeItem({ text: labels.createBranch,   icon: 'branch', enabled: isSingle, action: () => onCreateBranch() })
  const cherryItem     = await makeItem({ text: labels.cherryPick,     enabled: isSingle, action: () => onCherryPick() })
  const rebaseOntoItem = await makeItem({ text: labels.rebaseOnto,     enabled: isSingle, action: () => onRebaseOnto() })
  const revertItem     = await makeItem({ text: labels.revert,         icon: 'revert', enabled: isSingle, action: () => onRevert() })

  const resetSoftItem  = await makeItem({ text: labels.resetSoft,  action: () => onReset('soft') })
  const resetMixedItem = await makeItem({ text: labels.resetMixed, action: () => onReset('mixed') })
  const resetHardItem  = await makeItem({ text: labels.resetHard,  action: () => onReset('hard') })
  const resetSubmenu = await Submenu.new({
    text: labels.resetSubmenu,
    enabled: isSingle,
    items: [resetSoftItem, resetMixedItem, resetHardItem],
  })

  // Deferred: a richer WebStorm-style interactive rebase UI will implement these later.
  // They stay visible (disabled) with a transparent spacer icon so menu alignment holds.
  const recomposeItem = await makeItem({ text: labels.recompose, enabled: false })
  const interactiveRebaseItem = await makeItem({ text: labels.interactiveRebase, enabled: false })
  const editMessageItem = await makeItem({ text: labels.editMessage, enabled: false })
  const dropItem        = await makeItem({ text: labels.drop,        enabled: false })
  const moveUpItem       = await makeItem({ text: labels.moveUp,     enabled: false })
  const moveDownItem     = await makeItem({ text: labels.moveDown,   enabled: false })

  const copySha       = await makeItem({ text: labels.copySha, icon: 'copy_sha', enabled: isSingle, action: () => onCopySha() })
  const copyLinkItem  = await makeItem({ text: labels.copyLink, enabled: isSingle, action: () => onCopyLink() })
  const patchItem     = await makeItem({ text: labels.createPatch, enabled: isSingle, action: () => onCreatePatch() })

  const compareItem   = await makeItem({ text: labels.compareToWorkdir, enabled: isSingle, action: () => onCompareToWorkdir() })

  const createTag         = await makeItem({ text: labels.createTag,         icon: 'tag', enabled: isSingle, action: () => onCreateTag() })
  const createAnnotatedTag = await makeItem({ text: labels.createAnnotatedTag, icon: 'tag', enabled: isSingle, action: () => onCreateAnnotatedTag() })

  const fixupItem = await makeItem({ text: labels.fixup, icon: 'fixup', enabled: fixupEnabled, action: () => onFixup() })

  // ── Separators ────────────────────────────────────────────────────────────
  const sep  = () => PredefinedMenuItem.new({ item: 'Separator' })

  // ── Assemble (order matches the spec) ─────────────────────────────────────
  const items: (MenuItem | IconMenuItem | Submenu | PredefinedMenuItem)[] = []

  if (header) {
    items.push(header)
    items.push(await sep())
  }

  items.push(checkoutItem)
  items.push(await sep())
  items.push(worktreeItem)
  items.push(await sep())
  items.push(createBranch)
  items.push(cherryItem)
  items.push(rebaseOntoItem)
  items.push(resetSubmenu)
  items.push(revertItem)
  items.push(fixupItem)
  items.push(await sep())
  items.push(recomposeItem)
  items.push(interactiveRebaseItem)
  items.push(editMessageItem)
  items.push(dropItem)
  items.push(moveUpItem)
  items.push(moveDownItem)
  items.push(await sep())
  items.push(copySha)
  items.push(copyLinkItem)
  items.push(patchItem)
  items.push(await sep())
  items.push(compareItem)
  items.push(await sep())
  items.push(createTag)
  items.push(createAnnotatedTag)

  try {
    const menu = await Menu.new({ items })
    await menu.popup()
  } catch (err) {
    console.error('[nativeMenu] Failed to create or popup native menu:', err)
  }
}

export interface StashNativeMenuOptions {
  isHidden: boolean
  onApply: () => void
  onPop: () => void
  onDelete: () => void
  onEditMessage: () => void
  onToggleVisibility: () => void
}

/**
 * Builds and pops up a native macOS context menu for stash actions.
 */
export async function showStashNativeContextMenu(opts: StashNativeMenuOptions): Promise<void> {
  const { isHidden, onApply, onPop, onDelete, onEditMessage, onToggleVisibility } = opts

  // Ensure icons are loaded (noop after first call)
  try {
    await loadIcons()
  } catch (err) {
    console.error('[nativeMenu] Error loading icons:', err)
  }

  const applyItem   = await makeItem({ text: 'Apply stash', action: () => onApply() })
  const popItem     = await makeItem({ text: 'Pop stash',   action: () => onPop() })
  const deleteItem  = await makeItem({ text: 'Delete stash', action: () => onDelete() })
  const editItem    = await makeItem({ text: 'Edit stash message', action: () => onEditMessage() })
  const hideItem    = await makeItem({ text: isHidden ? 'Show the stash' : 'Hide the stash', action: () => onToggleVisibility() })

  const sep  = () => PredefinedMenuItem.new({ item: 'Separator' })

  const items = [
    applyItem,
    popItem,
    deleteItem,
    await sep(),
    editItem,
    hideItem,
  ]

  try {
    const menu = await Menu.new({ items })
    await menu.popup()
  } catch (err) {
    console.error('[nativeMenu] Failed to create or popup native stash menu:', err)
  }
}

export interface BranchNativeMenuOptions {
  isHead: boolean
  onDelete: () => void
}

/**
 * Builds and pops up a native context menu for local branch actions.
 */
export async function showBranchNativeContextMenu(opts: BranchNativeMenuOptions): Promise<void> {
  const { isHead, onDelete } = opts

  try {
    await loadIcons()
  } catch (err) {
    console.error('[nativeMenu] Error loading icons:', err)
  }

  const deleteItem = await makeItem({
    text: 'Delete branch',
    enabled: !isHead,
    action: () => onDelete(),
  })

  try {
    const menu = await Menu.new({ items: [deleteItem] })
    await menu.popup()
  } catch (err) {
    console.error('[nativeMenu] Failed to create or popup native branch menu:', err)
  }
}

