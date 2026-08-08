import { readAppConfig, writeAppConfigSection, type AppConfigLoad } from '../lib/tauri'

/**
 * The configuration file's contents, plus whether the file is switched off at all.
 *
 * A read that fails is reported and answered as "no configuration": the caller has defaults for
 * every section, and a permissions problem or a missing Tauri host (unit tests, a browser-loaded
 * page) must not be able to stop the app from starting.
 */
export async function apiReadAppConfig(): Promise<AppConfigLoad> {
  try {
    return await readAppConfig()
  } catch (e) {
    console.warn('Could not read the configuration file; falling back to defaults:', e)
    return { disabled: false, contents: null }
  }
}

/**
 * Replaces one section of the configuration. Rejects on failure — unlike the read, the caller needs
 * to know a save didn't land so it can report it rather than pretend the change is safe on disk.
 */
export async function apiWriteAppConfigSection(
  section: string,
  version: number,
  value: unknown
): Promise<void> {
  return writeAppConfigSection(section, version, value)
}
