import { create } from 'zustand'

/**
 * Open/close state for the Spotlight-style command palette (⌘K). Client-side UI
 * state only — nothing here is persisted. The palette itself is mounted once at
 * the app root (`App.tsx`) and driven from anywhere via this store (keyboard
 * shortcut, buttons, tests).
 */
interface CommandPaletteState {
  open: boolean
  openPalette: () => void
  closePalette: () => void
  toggle: () => void
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
