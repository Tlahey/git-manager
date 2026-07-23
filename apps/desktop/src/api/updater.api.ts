import type { Update } from '@tauri-apps/plugin-updater'
import { recordActivity } from '../lib/tauri'

export type { Update }

export interface UpdateProgress {
  downloadedBytes: number
  contentLength: number | null
}

/** Current app version, from the bundled Tauri metadata (matches `tauri.conf.json`'s `version`). */
export async function apiGetAppVersion(): Promise<string> {
  const { getVersion } = await import('@tauri-apps/api/app')
  return getVersion()
}

/** Queries the configured updater endpoint (see `tauri.conf.json`'s `plugins.updater`). Returns
 *  `null` when already up to date. The check bypasses the `invoke` wrapper (it calls the updater
 *  plugin directly), so it logs its own outcome to the Activity Logs journal. */
export async function apiCheckForUpdate(): Promise<Update | null> {
  const { check } = await import('@tauri-apps/plugin-updater')
  const start = performance.now()
  try {
    const update = await check()
    recordActivity('updater.check', 'ok', {
      durationMs: Math.round(performance.now() - start),
    })
    return update
  } catch (err) {
    recordActivity('updater.check', 'error', {
      durationMs: Math.round(performance.now() - start),
      error: String(err),
    })
    throw err
  }
}

/** Downloads and installs an update found via `apiCheckForUpdate`, reporting progress. */
export async function apiDownloadAndInstallUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void
): Promise<void> {
  let contentLength: number | null = null
  let downloadedBytes = 0

  const start = performance.now()
  try {
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength ?? null
          onProgress({ downloadedBytes: 0, contentLength })
          break
        case 'Progress':
          downloadedBytes += event.data.chunkLength
          onProgress({ downloadedBytes, contentLength })
          break
        case 'Finished':
          onProgress({ downloadedBytes: contentLength ?? downloadedBytes, contentLength })
          break
      }
    })
    recordActivity('updater.downloadAndInstall', 'ok', {
      durationMs: Math.round(performance.now() - start),
    })
  } catch (err) {
    recordActivity('updater.downloadAndInstall', 'error', {
      durationMs: Math.round(performance.now() - start),
      error: String(err),
    })
    throw err
  }
}

/** Restarts the app to complete an installed update. */
export async function apiRelaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
