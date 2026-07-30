import { create } from 'zustand'

interface E2ePathPickerState {
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
 * State for `E2ePathPickerDialog` — an in-webview stand-in for whichever native OS dialog
 * (`open({directory: true})`, `open()`, `save()`) `pickFolder`/`pickFile`/`pickSaveDestination`
 * would otherwise call, none of which WebDriver can drive (see apps/e2e/README.md). All three
 * only ever need one thing back — a path the test already knows it wants — so one dialog serves
 * all of them. Not persisted: it only ever holds one in-flight request, scoped to the current page.
 */
export const useE2ePathPickerStore = create<E2ePathPickerState>((set, get) => ({
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
