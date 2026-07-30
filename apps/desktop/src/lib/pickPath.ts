import { useE2ePathPickerStore } from '../stores/e2ePathPicker.store'

/**
 * Routes to the e2e debug path dialog in an e2e build, otherwise runs the real native dialog.
 * Shared by `pickFolder`/`pickFile`/`pickSaveDestination` — see `E2ePathPickerDialog.tsx` for why
 * one debug dialog covers all three.
 */
export function pickPath(real: () => Promise<string | null>): Promise<string | null> {
  if (import.meta.env.VITE_E2E === 'true') {
    return useE2ePathPickerStore.getState().request()
  }
  return real()
}
