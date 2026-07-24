import { create } from 'zustand'

export type CommandPaletteMode = 'all' | 'files'

/**
 * Open/close state and mode for the command palette.
 * - 'all': ⌘K — general actions, navigation, settings, file lookup
 * - 'files': ⌘P — dedicated file search
 */
interface CommandPaletteState {
  open: boolean
  mode: CommandPaletteMode
  openPalette: (mode?: CommandPaletteMode) => void
  closePalette: () => void
  toggle: (mode?: CommandPaletteMode) => void
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  mode: 'all',
  openPalette: (mode = 'all') => set({ open: true, mode }),
  closePalette: () => set({ open: false, mode: 'all' }),
  toggle: (mode = 'all') =>
    set((state) => {
      if (state.open && state.mode === mode) {
        return { open: false, mode: 'all' }
      }
      return { open: true, mode }
    }),
}))
