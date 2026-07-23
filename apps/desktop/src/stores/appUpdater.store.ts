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

/**
 * Global updater state on top of `tauri-plugin-updater`. It lives in a store (not a component hook)
 * because the check runs once at app startup — see `App.tsx` — while the UI that surfaces it (the
 * updater footer pinned to the Settings side panel) mounts only when Settings is open, so the
 * "an update is available" state must outlive that component.
 *
 * The live `Update` handle carries download methods, not just data, so it's kept in a module-level
 * ref rather than in the reactive store state.
 */
let updateRef: Update | null = null

interface AppUpdaterState {
  status: UpdaterStatus
  currentVersion: string | null
  availableVersion: string | null
  releaseNotes: string | null
  progress: UpdateProgress | null
  error: string | null
  /** Reads the bundled app version. No-op failure outside Tauri (e.g. component preview). */
  loadVersion: () => Promise<void>
  /**
   * Queries the updater endpoint. `silent` (used by the startup check) keeps quiet on the
   * "already up to date" and network-error outcomes so a launch never nags the user — only an
   * actually-available update visibly changes the footer button.
   */
  checkForUpdate: (options?: { silent?: boolean }) => Promise<void>
  downloadAndInstall: () => Promise<void>
  relaunch: () => Promise<void>
}

export const useAppUpdaterStore = create<AppUpdaterState>((set) => ({
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  releaseNotes: null,
  progress: null,
  error: null,

  loadVersion: async () => {
    try {
      set({ currentVersion: await apiGetAppVersion() })
    } catch {
      // Not running inside Tauri — leave version unset.
    }
  },

  checkForUpdate: async (options) => {
    const silent = options?.silent ?? false
    set({ status: 'checking', error: null })
    try {
      const update = await apiCheckForUpdate()
      if (!update) {
        updateRef = null
        set({ status: silent ? 'idle' : 'up-to-date' })
        return
      }
      updateRef = update
      set({
        availableVersion: update.version,
        releaseNotes: update.body ?? null,
        status: 'available',
      })
    } catch (err) {
      if (silent) {
        set({ status: 'idle' })
        return
      }
      set({ error: err instanceof Error ? err.message : String(err), status: 'error' })
    }
  },

  downloadAndInstall: async () => {
    if (!updateRef) return
    set({ status: 'downloading', error: null, progress: { downloadedBytes: 0, contentLength: null } })
    try {
      await apiDownloadAndInstallUpdate(updateRef, (progress) => set({ progress }))
      set({ status: 'ready' })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), status: 'error' })
    }
  },

  relaunch: async () => {
    await apiRelaunchApp()
  },
}))

/** Test-only: reset the module-level live update handle between cases. */
export function __resetAppUpdaterHandle() {
  updateRef = null
}
