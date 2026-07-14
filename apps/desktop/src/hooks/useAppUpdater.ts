import { useEffect, useRef, useState } from 'react'
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
 * Drives Settings → General's "check for updates" flow on top of `tauri-plugin-updater`: reads
 * the bundled app version, polls the configured endpoint (see `tauri.conf.json`'s
 * `plugins.updater`), then downloads/installs and offers a relaunch. The live `Update` handle is
 * kept in a ref rather than state — it carries download methods, not just data, so it shouldn't
 * be treated as a value that triggers re-renders.
 */
export function useAppUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const updateRef = useRef<Update | null>(null)

  useEffect(() => {
    apiGetAppVersion()
      .then(setCurrentVersion)
      .catch(() => {
        // Not running inside Tauri (e.g. component preview) — leave version unset.
      })
  }, [])

  async function checkForUpdate() {
    setStatus('checking')
    setError(null)
    try {
      const update = await apiCheckForUpdate()
      if (!update) {
        updateRef.current = null
        setStatus('up-to-date')
        return
      }
      updateRef.current = update
      setAvailableVersion(update.version)
      setReleaseNotes(update.body ?? null)
      setStatus('available')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  async function downloadAndInstall() {
    const update = updateRef.current
    if (!update) return
    setStatus('downloading')
    setError(null)
    setProgress({ downloadedBytes: 0, contentLength: null })
    try {
      await apiDownloadAndInstallUpdate(update, setProgress)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  async function relaunch() {
    await apiRelaunchApp()
  }

  return {
    status,
    currentVersion,
    availableVersion,
    releaseNotes,
    progress,
    error,
    checkForUpdate,
    downloadAndInstall,
    relaunch,
  }
}
