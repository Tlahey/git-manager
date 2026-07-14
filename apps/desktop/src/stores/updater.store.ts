import { create } from 'zustand'
import {
  apiCheckForUpdate,
  apiDownloadAndInstallUpdate,
  apiGetAppVersion,
  apiRelaunchApp,
  type Update,
  type UpdateProgress,
} from '../api/updater.api'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

interface UpdaterState {
  status: UpdaterStatus
  currentVersion: string | null
  availableVersion: string | null
  releaseNotes: string | null
  progress: UpdateProgress | null
  error: string | null
  updateHandle: Update | null
  loadCurrentVersion: () => Promise<void>
  checkForUpdate: (opts?: { silent?: boolean }) => Promise<void>
  downloadAndInstall: () => Promise<void>
  relaunch: () => Promise<void>
}

/**
 * Client-side, session-only (not persisted) updater state, shared by the Settings → General
 * update card and the footer badge so a single check — run once at startup via
 * `useAppUpdateCheck` — is reflected everywhere without either surface re-querying the endpoint
 * on its own. The live `Update` handle from tauri-plugin-updater carries download/install
 * methods, not just data, but Zustand doesn't require state to be serializable so it's kept here
 * directly rather than in a side ref.
 */
export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  releaseNotes: null,
  progress: null,
  error: null,
  updateHandle: null,

  loadCurrentVersion: async () => {
    try {
      const version = await apiGetAppVersion()
      set({ currentVersion: version })
    } catch {
      // Not running inside Tauri (e.g. component preview) — leave version unset.
    }
  },

  checkForUpdate: async (opts) => {
    const silent = opts?.silent ?? false
    set({ status: 'checking', error: null })
    try {
      const update = await apiCheckForUpdate()
      if (!update) {
        set({ status: 'up-to-date', updateHandle: null, availableVersion: null })
        return
      }
      set({
        status: 'available',
        updateHandle: update,
        availableVersion: update.version,
        releaseNotes: update.body ?? null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (silent) {
        // A background startup check failing (e.g. offline) shouldn't surface as a scary error —
        // only an explicit "check for updates" click should.
        console.warn('Background update check failed:', message)
        set({ status: 'idle' })
        return
      }
      set({ status: 'error', error: message })
    }
  },

  downloadAndInstall: async () => {
    const { updateHandle } = get()
    if (!updateHandle) return
    set({ status: 'downloading', error: null, progress: { downloadedBytes: 0, contentLength: null } })
    try {
      await apiDownloadAndInstallUpdate(updateHandle, (progress) => set({ progress }))
      set({ status: 'ready' })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  relaunch: async () => {
    await apiRelaunchApp()
  },
}))
