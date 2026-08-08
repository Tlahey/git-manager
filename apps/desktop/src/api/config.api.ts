import {
  getAppConfigPath,
  readAppConfig,
  revealPathInFinder,
  writeAppConfigSection,
  type AppConfigLoad,
} from '../lib/tauri'

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

/**
 * Where the configuration file is, or `null` when there is none to point at — the file is switched
 * off (`GIT_MANAGER_NO_CONFIG`), or the home directory can't be resolved. Settings shows the path
 * rather than assuming one: the affordance this replaced was pointed at a hardcoded
 * `~/.config/git-manager/` that never existed, so it silently opened nothing for as long as it
 * shipped.
 */
export async function apiGetAppConfigPath(): Promise<string | null> {
  try {
    return await getAppConfigPath()
  } catch (e) {
    console.warn('Could not resolve the configuration file path:', e)
    return null
  }
}

/** Reveals the configuration file in the Finder, selected rather than merely opening its folder. */
export async function apiRevealAppConfig(path: string): Promise<void> {
  return revealPathInFinder(path)
}
