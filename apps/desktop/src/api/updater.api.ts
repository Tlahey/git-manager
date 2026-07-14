import type { Update } from '@tauri-apps/plugin-updater'

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
 *  `null` when already up to date. */
export async function apiCheckForUpdate(): Promise<Update | null> {
  const { check } = await import('@tauri-apps/plugin-updater')
  return check()
}

/** Downloads and installs an update found via `apiCheckForUpdate`, reporting progress. */
export async function apiDownloadAndInstallUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void
): Promise<void> {
  let contentLength: number | null = null
  let downloadedBytes = 0

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
}

/** Restarts the app to complete an installed update. */
export async function apiRelaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
