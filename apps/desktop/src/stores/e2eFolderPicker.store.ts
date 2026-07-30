import { create } from 'zustand'

interface E2eFolderPickerState {
  open: boolean
  value: string
  resolve: ((path: string | null) => void) | null
  /** Opens the debug dialog and resolves once the test confirms or cancels it. */
  request: () => Promise<string | null>
  setValue: (value: string) => void
  confirm: () => void
  cancel: () => void
}

/**
 * State for `E2eFolderPickerDialog` — an in-webview stand-in for the native OS folder picker,
 * which WebDriver can't drive (see apps/e2e/README.md). Not persisted: it only ever holds one
 * in-flight request, scoped to the current page.
 */
export const useE2eFolderPickerStore = create<E2eFolderPickerState>((set, get) => ({
  open: false,
  value: '',
  resolve: null,

  request: () =>
    new Promise((resolve) => {
      set({ open: true, value: '', resolve })
    }),

  setValue: (value) => set({ value }),

  confirm: () => {
    const { resolve, value } = get()
    resolve?.(value.trim() || null)
    set({ open: false, resolve: null, value: '' })
  },

  cancel: () => {
    const { resolve } = get()
    resolve?.(null)
    set({ open: false, resolve: null, value: '' })
  },
}))
