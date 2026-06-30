import { Menu, MenuItem, IconMenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { resolveResource } from '@tauri-apps/api/path'
import { Image } from '@tauri-apps/api/image'

// ── Icon resolution ──────────────────────────────────────────────────────────
// Icons are bundled as resources in src-tauri/icons/menu/*.png and resolved
// at runtime.

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

export interface CommitNativeMenuOptions {
  isSingle: boolean
  targetCount: number
  onReset: () => void
  onRevert: () => void
  onCreateBranch: () => void
  onCopySha: () => void
  onFixup: () => void
}

/**
 * Builds and pops up a native macOS context menu for commit actions.
 * Uses Tauri v2's built-in Menu API with bundled PNG icons resolved at runtime.
 */
export async function showCommitNativeContextMenu(opts: CommitNativeMenuOptions): Promise<void> {
  const { isSingle, targetCount, onReset, onRevert, onCreateBranch, onCopySha, onFixup } = opts

  // Ensure icons are loaded (noop after first call)
  try {
    await loadIcons()
  } catch (err) {
    console.error('[nativeMenu] Error loading icons:', err)
  }

  // ── Header (multi-select count) ───────────────────────────────────────────
  const header = targetCount > 1
    ? await MenuItem.new({ text: `${targetCount} commits selected`, enabled: false })
    : null

  // ── Items ─────────────────────────────────────────────────────────────────
  const copySha      = await makeItem({ text: 'Copy SHA',                icon: 'copy_sha', enabled: isSingle, action: () => onCopySha() })
  const createBranch = await makeItem({ text: 'Create branch here…',     icon: 'branch',   enabled: isSingle, action: () => onCreateBranch() })
  const createTag    = await makeItem({ text: 'Create tag here…',        icon: 'tag',      enabled: false })
  const resetItem    = await makeItem({ text: 'Reset to here…',          icon: 'reset',    enabled: isSingle, action: () => onReset() })
  const revertItem   = await makeItem({ text: 'Revert this commit',      icon: 'revert',   enabled: isSingle, action: () => onRevert() })
  const fixupItem    = await makeItem({ text: 'Fixup from changes',      icon: 'fixup',    enabled: isSingle, action: () => onFixup() })

  // Coming soon — aligned with transparent placeholder icon
  const squashItem    = await makeItem({ text: 'Squash commits…',              enabled: false })
  const rewordItem    = await makeItem({ text: 'Reword (rename message)',      enabled: false })
  const amendItem     = await makeItem({ text: 'Edit commit (amend)',          enabled: false })
  const rebaseItem    = await makeItem({ text: 'Interactive rebase from here', enabled: false })
  const cherryItem    = await makeItem({ text: 'Cherry-pick this commit',      enabled: false })
  const checkoutItem  = await makeItem({ text: 'Checkout (detached HEAD)',     enabled: false })
  const dropItem      = await makeItem({ text: 'Drop this commit',             enabled: false })

  // ── Separators ────────────────────────────────────────────────────────────
  const sep  = () => PredefinedMenuItem.new({ item: 'Separator' })

  // ── Assemble ──────────────────────────────────────────────────────────────
  const items: (MenuItem | IconMenuItem | Submenu | PredefinedMenuItem)[] = []

  if (header) {
    items.push(header)
    items.push(await sep())
  }

  items.push(copySha)
  items.push(await sep())
  items.push(createBranch)
  items.push(createTag)
  items.push(await sep())
  items.push(resetItem)
  items.push(revertItem)
  items.push(await sep())
  items.push(fixupItem)
  items.push(squashItem)
  items.push(await sep())
  items.push(rewordItem)
  items.push(amendItem)
  items.push(rebaseItem)
  items.push(cherryItem)
  items.push(checkoutItem)
  items.push(dropItem)

  try {
    const menu = await Menu.new({ items })
    await menu.popup()
  } catch (err) {
    console.error('[nativeMenu] Failed to create or popup native menu:', err)
  }
}
