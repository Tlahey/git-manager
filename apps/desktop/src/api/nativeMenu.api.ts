import { Menu, MenuItem, IconMenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { resolveResource } from '@tauri-apps/api/path'
import { Image } from '@tauri-apps/api/image'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  normalizeMenuSpec,
  type MenuSpecEntry,
  type MenuSpecNode,
} from '../lib/nativeMenuSpec'

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

// ── Generic spec-driven menu ─────────────────────────────────────────────────

type BuiltMenuItem = MenuItem | IconMenuItem | Submenu | PredefinedMenuItem

async function buildSpecItems(nodes: MenuSpecNode[]): Promise<BuiltMenuItem[]> {
  const out: BuiltMenuItem[] = []
  for (const node of nodes) {
    switch (node.kind) {
      case 'separator':
        out.push(await PredefinedMenuItem.new({ item: 'Separator' }))
        break
      case 'header':
        out.push(await MenuItem.new({ text: node.text, enabled: false }))
        break
      case 'item':
        out.push(
          await makeItem({
            text: node.text,
            icon: node.icon,
            enabled: node.enabled ?? true,
            action: node.action,
          })
        )
        break
      case 'submenu':
        out.push(
          await Submenu.new({
            text: node.text,
            // Transparent spacer keeps submenu labels aligned with sibling icon items.
            icon: blankImg,
            enabled: node.enabled ?? true,
            items: await buildSpecItems(normalizeMenuSpec(node.items)),
          })
        )
        break
    }
  }
  return out
}

/**
 * Renders and pops up a native context menu described declaratively (see `lib/nativeMenuSpec.ts`).
 * The content of a menu — items, order, per-context conditions — is composed by pure builders
 * (e.g. `lib/graphContextMenus.ts`), fully decoupled from this Tauri rendering layer. Item text
 * arrives pre-translated: this module has no React/i18n context.
 */
export async function showNativeMenu(entries: MenuSpecEntry[]): Promise<void> {
  try {
    await loadIcons()
  } catch (err) {
    console.error('[nativeMenu] Error loading icons:', err)
  }

  await refreshThemeState()

  const spec = normalizeMenuSpec(entries)
  if (spec.length === 0) return

  try {
    const menu = await Menu.new({ items: await buildSpecItems(spec) })
    await menu.popup()
  } catch (err) {
    console.error('[nativeMenu] Failed to create or popup native menu:', err)
  }
}



