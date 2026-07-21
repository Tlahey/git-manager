import { Menu, MenuItem, IconMenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { resolveResource } from '@tauri-apps/api/path'
import { Image } from '@tauri-apps/api/image'
import { getCurrentWindow } from '@tauri-apps/api/window'

// ── Icon resolution ──────────────────────────────────────────────────────────
// Icons are bundled as resources in src-tauri/icons/menu/*.png and resolved
// at runtime.

// Only names with a bundled PNG resource go here — items without one fall back to the
// transparent blank spacer (see `makeItem`) rather than logging a resolve failure on every load.
const ICON_NAMES = ['copy_sha', 'branch', 'tag', 'reset', 'revert', 'fixup'] as const
type IconName = (typeof ICON_NAMES)[number]

let resolvedIcons: Partial<Record<IconName, Image>> = {}
// Tinted variants of the same glyphs — macOS renders custom (non-template) menu
// icons as-is regardless of dark mode or disabled state, so we recolor the RGBA
// buffer ourselves instead of relying on the OS to do it.
let whiteIcons: Partial<Record<IconName, Image>> = {}
let greyIcons: Partial<Record<IconName, Image>> = {}
let blankImg: Image | undefined
let hasAttemptedResolve = false

// Refreshed once per menu build (see refreshThemeState) rather than threaded through
// every makeItem call.
let isDarkWindow = false

const WHITE_RGB: [number, number, number] = [255, 255, 255]
const GREY_RGB: [number, number, number] = [142, 142, 147] // macOS systemGray
const DISABLED_OPACITY = 0.4

/** Recolors an icon's RGB channels while preserving (and optionally scaling down) its alpha. */
async function tintImage(
  base: Image,
  [r, g, b]: [number, number, number],
  opacity = 1
): Promise<Image> {
  const [{ width, height }, rgba] = await Promise.all([base.size(), base.rgba()])
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = Math.round(rgba[i + 3] * opacity)
  }
  return Image.new(out, width, height)
}

/**
 * Resolves all menu icon paths and loads them into Tauri Image instances.
 * Also generates a transparent blank Image in memory to use as a fallback alignment placeholder,
 * plus white/grey tinted variants of each icon for dark mode and disabled rendering.
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

  // 2. Load custom icons from resources, then derive tinted variants
  await Promise.all(
    ICON_NAMES.map(async (name) => {
      try {
        const path = await resolveResource(`icons/menu/${name}.png`)
        const img = await Image.fromPath(path)
        resolvedIcons[name] = img
        const [white, grey] = await Promise.all([
          tintImage(img, WHITE_RGB),
          tintImage(img, GREY_RGB, DISABLED_OPACITY),
        ])
        whiteIcons[name] = white
        greyIcons[name] = grey
      } catch (err) {
        console.warn(`[nativeMenu] Failed to load icon "${name}":`, err)
      }
    })
  )
}

/** Reads the window's current effective theme so icons can be tinted accordingly. */
async function refreshThemeState(): Promise<void> {
  try {
    isDarkWindow = (await getCurrentWindow().theme()) === 'dark'
  } catch (err) {
    console.warn('[nativeMenu] Failed to read window theme:', err)
  }
}

async function makeItem(opts: {
  text: string
  icon?: IconName
  enabled?: boolean
  action?: () => void
}): Promise<MenuItem | IconMenuItem> {
  const { text, icon, enabled = true, action } = opts

  // Disabled always wins (greyed out) regardless of theme; otherwise pick the
  // white variant in dark mode so the glyph stays visible against the dark menu.
  const tinted = icon
    ? !enabled
      ? greyIcons[icon]
      : isDarkWindow
        ? whiteIcons[icon]
        : resolvedIcons[icon]
    : undefined

  // Use the tinted/loaded icon or fall back to the transparent blank placeholder to align items
  const img = tinted || (icon ? resolvedIcons[icon] : undefined) || blankImg

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
  undoCommit: string
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
  /** Enable "Undo commit" only for the tip commit (HEAD) when it has a parent to reset onto. */
  undoCommitEnabled: boolean
  targetCount: number
  labels: CommitNativeMenuLabels
  onCheckout: () => void
  onCreateWorktree: () => void
  onCreateBranch: () => void
  onCherryPick: () => void
  onRebaseOnto: () => void
  onReset: (mode: 'soft' | 'mixed' | 'hard') => void
  onUndoCommit: () => void
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
    undoCommitEnabled,
    targetCount,
    labels,
    onCheckout,
    onCreateWorktree,
    onCreateBranch,
    onCherryPick,
    onRebaseOnto,
    onReset,
    onUndoCommit,
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

  await refreshThemeState()

  // ── Header (multi-select count) ───────────────────────────────────────────
  const header =
    targetCount > 1 ? await MenuItem.new({ text: labels.selectedCount, enabled: false }) : null

  // ── Items ─────────────────────────────────────────────────────────────────
  const checkoutItem = await makeItem({
    text: labels.checkout,
    enabled: isSingle,
    action: () => onCheckout(),
  })
  const worktreeItem = await makeItem({
    text: labels.createWorktree,
    enabled: isSingle,
    action: () => onCreateWorktree(),
  })
  const createBranch = await makeItem({
    text: labels.createBranch,
    icon: 'branch',
    enabled: isSingle,
    action: () => onCreateBranch(),
  })
  const cherryItem = await makeItem({
    text: labels.cherryPick,
    enabled: isSingle,
    action: () => onCherryPick(),
  })
  const rebaseOntoItem = await makeItem({
    text: labels.rebaseOnto,
    enabled: isSingle,
    action: () => onRebaseOnto(),
  })
  const revertItem = await makeItem({
    text: labels.revert,
    icon: 'revert',
    enabled: isSingle,
    action: () => onRevert(),
  })

  const resetSoftItem = await makeItem({ text: labels.resetSoft, action: () => onReset('soft') })
  const resetMixedItem = await makeItem({ text: labels.resetMixed, action: () => onReset('mixed') })
  const resetHardItem = await makeItem({ text: labels.resetHard, action: () => onReset('hard') })
  const resetSubmenu = await Submenu.new({
    text: labels.resetSubmenu,
    icon: blankImg,
    enabled: isSingle,
    items: [resetSoftItem, resetMixedItem, resetHardItem],
  })
  const undoCommitItem = await makeItem({
    text: labels.undoCommit,
    icon: 'reset',
    enabled: undoCommitEnabled,
    action: () => onUndoCommit(),
  })

  // Deferred: a richer WebStorm-style interactive rebase UI will implement these later.
  // They stay visible (disabled) with a transparent spacer icon so menu alignment holds.
  const recomposeItem = await makeItem({ text: labels.recompose, enabled: false })
  const interactiveRebaseItem = await makeItem({ text: labels.interactiveRebase, enabled: false })
  const editMessageItem = await makeItem({ text: labels.editMessage, enabled: false })
  const dropItem = await makeItem({ text: labels.drop, enabled: false })
  const moveUpItem = await makeItem({ text: labels.moveUp, enabled: false })
  const moveDownItem = await makeItem({ text: labels.moveDown, enabled: false })

  const copySha = await makeItem({
    text: labels.copySha,
    icon: 'copy_sha',
    enabled: isSingle,
    action: () => onCopySha(),
  })
  const copyLinkItem = await makeItem({
    text: labels.copyLink,
    enabled: isSingle,
    action: () => onCopyLink(),
  })
  const patchItem = await makeItem({
    text: labels.createPatch,
    enabled: isSingle,
    action: () => onCreatePatch(),
  })

  const compareItem = await makeItem({
    text: labels.compareToWorkdir,
    enabled: isSingle,
    action: () => onCompareToWorkdir(),
  })

  const createTag = await makeItem({
    text: labels.createTag,
    icon: 'tag',
    enabled: isSingle,
    action: () => onCreateTag(),
  })
  const createAnnotatedTag = await makeItem({
    text: labels.createAnnotatedTag,
    icon: 'tag',
    enabled: isSingle,
    action: () => onCreateAnnotatedTag(),
  })

  const fixupItem = await makeItem({
    text: labels.fixup,
    icon: 'fixup',
    enabled: fixupEnabled,
    action: () => onFixup(),
  })

  // ── Separators ────────────────────────────────────────────────────────────
  const sep = () => PredefinedMenuItem.new({ item: 'Separator' })

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
  items.push(undoCommitItem)
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

export interface RefDropNativeMenuLabels {
  fastForward: string
  merge: string
  rebase: string
  interactiveRebase: string
  push: string
  resetSubmenu: string
  resetSoft: string
  resetMixed: string
  resetHard: string
  startPr: string
}

export interface RefDropNativeMenuOptions {
  /** Pre-translated, pre-interpolated item text (this module has no React/i18n context). */
  labels: RefDropNativeMenuLabels
  fastForwardEnabled: boolean
  mergeEnabled: boolean
  rebaseEnabled: boolean
  interactiveRebaseEnabled: boolean
  pushEnabled: boolean
  resetEnabled: boolean
  prEnabled: boolean
  onFastForward: () => void
  onMerge: () => void
  onRebase: () => void
  onInteractiveRebase: () => void
  onPush: () => void
  onReset: (mode: 'soft' | 'mixed' | 'hard') => void
  onStartPr: () => void
}

/**
 * Builds and pops up the native context menu shown when one ref badge (branch/tag) is dropped
 * onto another in the commit graph. Mirrors {@link showCommitNativeContextMenu}: item text is
 * passed in pre-translated via `labels`, enablement per action via `*Enabled`, and each action
 * wired via an `on*` callback. Item order matches the drop-menu spec.
 */
export async function showRefDropNativeContextMenu(opts: RefDropNativeMenuOptions): Promise<void> {
  const {
    labels,
    fastForwardEnabled,
    mergeEnabled,
    rebaseEnabled,
    interactiveRebaseEnabled,
    pushEnabled,
    resetEnabled,
    prEnabled,
    onFastForward,
    onMerge,
    onRebase,
    onInteractiveRebase,
    onPush,
    onReset,
    onStartPr,
  } = opts

  try {
    await loadIcons()
  } catch (err) {
    console.error('[nativeMenu] Error loading icons:', err)
  }

  await refreshThemeState()

  const fastForwardItem = await makeItem({
    text: labels.fastForward,
    enabled: fastForwardEnabled,
    action: () => onFastForward(),
  })
  const mergeItem = await makeItem({
    text: labels.merge,
    enabled: mergeEnabled,
    action: () => onMerge(),
  })
  const rebaseItem = await makeItem({
    text: labels.rebase,
    enabled: rebaseEnabled,
    action: () => onRebase(),
  })
  const interactiveRebaseItem = await makeItem({
    text: labels.interactiveRebase,
    enabled: interactiveRebaseEnabled,
    action: () => onInteractiveRebase(),
  })
  const pushItem = await makeItem({
    text: labels.push,
    enabled: pushEnabled,
    action: () => onPush(),
  })

  const resetSoftItem = await makeItem({ text: labels.resetSoft, action: () => onReset('soft') })
  const resetMixedItem = await makeItem({ text: labels.resetMixed, action: () => onReset('mixed') })
  const resetHardItem = await makeItem({ text: labels.resetHard, action: () => onReset('hard') })
  const resetSubmenu = await Submenu.new({
    text: labels.resetSubmenu,
    icon: blankImg,
    enabled: resetEnabled,
    items: [resetSoftItem, resetMixedItem, resetHardItem],
  })

  const startPrItem = await makeItem({
    text: labels.startPr,
    enabled: prEnabled,
    action: () => onStartPr(),
  })

  const sep = () => PredefinedMenuItem.new({ item: 'Separator' })

  const items = [
    fastForwardItem,
    mergeItem,
    rebaseItem,
    interactiveRebaseItem,
    await sep(),
    pushItem,
    resetSubmenu,
    await sep(),
    startPrItem,
  ]

  try {
    const menu = await Menu.new({ items })
    await menu.popup()
  } catch (err) {
    console.error('[nativeMenu] Failed to create or popup native ref-drop menu:', err)
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

  await refreshThemeState()

  const applyItem = await makeItem({ text: 'Apply stash', action: () => onApply() })
  const popItem = await makeItem({ text: 'Pop stash', action: () => onPop() })
  const deleteItem = await makeItem({ text: 'Delete stash', action: () => onDelete() })
  const editItem = await makeItem({ text: 'Edit stash message', action: () => onEditMessage() })
  const hideItem = await makeItem({
    text: isHidden ? 'Show the stash' : 'Hide the stash',
    action: () => onToggleVisibility(),
  })

  const sep = () => PredefinedMenuItem.new({ item: 'Separator' })

  const items = [applyItem, popItem, deleteItem, await sep(), editItem, hideItem]

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

  await refreshThemeState()

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
