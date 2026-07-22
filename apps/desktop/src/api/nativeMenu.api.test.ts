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

import { menuItem, menuSubmenu, menuSeparator, menuHeader } from '../lib/nativeMenuSpec'

type NativeMenuModule = typeof import('./nativeMenu.api')

/** A representative spec exercising every node kind and an icon item. */
function sampleSpec() {
  return [
    menuItem({ text: 'Copy SHA', icon: 'copy_sha', action: vi.fn() }),
    menuSeparator(),
    menuSubmenu({
      text: 'Reset',
      items: [menuItem({ text: 'Soft' }), menuItem({ text: 'Mixed' }), menuItem({ text: 'Hard' })],
    }),
  ]
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
    await api.showNativeMenu(sampleSpec())
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
    await api.showNativeMenu(sampleSpec())
    await api.showNativeMenu(sampleSpec())
    expect(resolveResource).toHaveBeenCalledTimes(6)
  })

  it('warns but keeps building the menu when one icon fails to resolve', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveResource.mockImplementation(async (p: string) => {
      if (p.includes('branch')) throw new Error('missing resource')
      return `/resources/${p}`
    })
    const api = await freshApi()
    await expect(api.showNativeMenu(sampleSpec())).resolves.toBeUndefined()
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
    await api.showNativeMenu([menuItem({ text: 'Copy SHA', icon: 'copy_sha' })])
    const arg = iconArgOf('Copy SHA')
    expect(arg?.icon?.__path).toBe('/resources/icons/menu/copy_sha.png')
  })

  it('uses the white-tinted icon in dark mode when enabled', async () => {
    windowTheme.mockResolvedValue('dark')
    const api = await freshApi()
    await api.showNativeMenu([menuItem({ text: 'Copy SHA', icon: 'copy_sha' })])
    const arg = iconArgOf('Copy SHA')
    expect(arg?.icon?.__rgba?.[0]).toBe(255)
  })

  it('uses the grey-tinted icon when disabled, regardless of theme', async () => {
    windowTheme.mockResolvedValue('dark')
    const api = await freshApi()
    await api.showNativeMenu([menuItem({ text: 'Copy SHA', icon: 'copy_sha', enabled: false })])
    const arg = iconArgOf('Copy SHA')
    expect(arg?.icon?.__rgba?.[0]).toBe(142)
  })
})

describe('showNativeMenu — spec rendering', () => {
  it('renders a header as a disabled plain MenuItem', async () => {
    const api = await freshApi()
    await api.showNativeMenu([menuHeader('3 selected'), menuItem({ text: 'A' })])
    expect(menuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: '3 selected', enabled: false })
    )
  })

  it('renders separators as PredefinedMenuItem and normalizes doubled ones away', async () => {
    const api = await freshApi()
    await api.showNativeMenu([
      menuItem({ text: 'A' }),
      menuSeparator(),
      menuSeparator(),
      menuItem({ text: 'B' }),
    ])
    expect(predefinedMenuItemNew).toHaveBeenCalledTimes(1)
    expect(predefinedMenuItemNew).toHaveBeenCalledWith({ item: 'Separator' })
  })

  it('drops falsy conditional entries', async () => {
    const api = await freshApi()
    await api.showNativeMenu([false, menuItem({ text: 'Kept' }), null])
    expect(iconMenuItemNew).toHaveBeenCalledTimes(1)
    expect(iconMenuItemNew).toHaveBeenCalledWith(expect.objectContaining({ text: 'Kept' }))
  })

  it('does not popup anything for an empty (all-falsy) spec', async () => {
    const api = await freshApi()
    await api.showNativeMenu([false, menuSeparator()])
    expect(menuNew).not.toHaveBeenCalled()
    expect(menuPopup).not.toHaveBeenCalled()
  })

  it('items default to enabled and honour an explicit enabled: false', async () => {
    const api = await freshApi()
    await api.showNativeMenu([
      menuItem({ text: 'On' }),
      menuItem({ text: 'Off', enabled: false }),
    ])
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'On', enabled: true })
    )
    expect(iconMenuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Off', enabled: false })
    )
  })

  it('wires an item action through to the rendered menu item', async () => {
    const action = vi.fn()
    const api = await freshApi()
    await api.showNativeMenu([menuItem({ text: 'Checkout', action })])
    const call = iconMenuItemNew.mock.calls.find(
      ([opts]) => (opts as { text: string }).text === 'Checkout'
    )
    ;(call![0] as { action: () => void }).action()
    expect(action).toHaveBeenCalledOnce()
  })

  it('builds a submenu with its normalized child items and enabled flag', async () => {
    const api = await freshApi()
    await api.showNativeMenu([
      menuSubmenu({
        text: 'Reset',
        enabled: false,
        items: [menuItem({ text: 'Soft' }), false, menuItem({ text: 'Hard' })],
      }),
    ])
    expect(submenuNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Reset', enabled: false, items: expect.any(Array) })
    )
    const submenuCall = submenuNew.mock.calls[0][0] as { items: unknown[] }
    expect(submenuCall.items).toHaveLength(2)
  })

  it('builds and pops up the assembled menu', async () => {
    const api = await freshApi()
    await api.showNativeMenu(sampleSpec())
    expect(menuNew).toHaveBeenCalledOnce()
    expect(menuPopup).toHaveBeenCalledOnce()
  })

  it('logs and does not throw when building/popping the menu fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    menuNew.mockRejectedValueOnce(new Error('native menu failure'))
    const api = await freshApi()
    await expect(api.showNativeMenu(sampleSpec())).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})
