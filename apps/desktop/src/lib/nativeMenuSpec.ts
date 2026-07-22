/**
 * Declarative description of a native context menu, decoupled from the Tauri menu API so menu
 * CONTENT (what shows, in which order, under which conditions) is plain data built by pure,
 * unit-testable functions — see `graphContextMenus.ts` — while the RENDERING (icons, theming,
 * popup) stays in `api/nativeMenu.api.ts`'s generic `showNativeMenu(spec)`.
 *
 * Builders return `MenuSpecEntry[]` where falsy entries are allowed, so conditional items read
 * naturally (`isSingle && item(...)`). `normalizeMenuSpec` then drops the falsy entries, prunes
 * empty submenus, and collapses/trims separators — a builder never has to worry about leaving a
 * dangling separator when a whole section is conditionally absent.
 */

/** Icon names with a bundled PNG resource (see `nativeMenu.api.ts`'s ICON_NAMES). */
export type MenuSpecIcon = 'copy_sha' | 'branch' | 'tag' | 'reset' | 'revert' | 'fixup'

export type MenuSpecNode =
  | {
      kind: 'item'
      text: string
      icon?: MenuSpecIcon
      /** Defaults to `true`. Disabled items stay visible but greyed out. */
      enabled?: boolean
      action?: () => void
    }
  | {
      kind: 'submenu'
      text: string
      /** Defaults to `true`. */
      enabled?: boolean
      items: MenuSpecEntry[]
    }
  | { kind: 'separator' }
  /** Non-interactive title line (e.g. the multi-select "N commits selected" header). */
  | { kind: 'header'; text: string }

/** What builders may emit: falsy entries are conditional no-ops removed by normalization. */
export type MenuSpecEntry = MenuSpecNode | false | null | undefined

// ── Ergonomic constructors ───────────────────────────────────────────────────

export function menuItem(opts: {
  text: string
  icon?: MenuSpecIcon
  enabled?: boolean
  action?: () => void
}): MenuSpecNode {
  return { kind: 'item', ...opts }
}

export function menuSubmenu(opts: {
  text: string
  enabled?: boolean
  items: MenuSpecEntry[]
}): MenuSpecNode {
  return { kind: 'submenu', ...opts }
}

export function menuSeparator(): MenuSpecNode {
  return { kind: 'separator' }
}

export function menuHeader(text: string): MenuSpecNode {
  return { kind: 'header', text }
}

/**
 * Resolves a spec into its renderable form: drops falsy (conditional) entries, recursively
 * normalizes submenus and prunes the ones left with no real item, then collapses consecutive
 * separators and trims the leading/trailing ones.
 */
export function normalizeMenuSpec(entries: MenuSpecEntry[]): MenuSpecNode[] {
  const nodes: MenuSpecNode[] = []
  for (const entry of entries) {
    if (!entry) continue
    if (entry.kind === 'submenu') {
      const items = normalizeMenuSpec(entry.items)
      if (items.length === 0) continue
      nodes.push({ ...entry, items })
      continue
    }
    nodes.push(entry)
  }

  const out: MenuSpecNode[] = []
  for (const node of nodes) {
    if (node.kind === 'separator') {
      // No leading separator, no doubled separators.
      if (out.length === 0 || out[out.length - 1].kind === 'separator') continue
    }
    out.push(node)
  }
  while (out.length > 0 && out[out.length - 1].kind === 'separator') out.pop()
  return out
}
