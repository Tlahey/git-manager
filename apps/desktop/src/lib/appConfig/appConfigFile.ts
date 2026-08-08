import { apiReadAppConfig, apiWriteAppConfigSection } from '../../api/config.api'
import {
  CONFIG_SECTIONS,
  SECTION_LEGACY_ADAPTERS,
  SECTION_LEGACY_KEYS,
  type ConfigSection,
} from './sections'
import { validateSection } from './validate'

/**
 * The in-memory view of `~/.git-manager/settings.json`, loaded once per window.
 *
 * The file is read a single time, before the first render ({@link loadAppConfig}, awaited in
 * `main.tsx`), and every store then hydrates from this object synchronously. That is what lets nine
 * `zustand/persist` stores share one file without nine reads, and what keeps the app from painting
 * a frame in the default theme and language before the disk answers.
 *
 * Writes go the other way, one section at a time (`write_app_config_section`), for a reason that
 * only shows up with several windows open: each window holds its own copy of what it loaded, so a
 * whole-file write from the notch window would roll back every section the main window changed
 * since. Naming the section confines a stale writer to the state it actually owns.
 *
 * When the file is switched off (`GIT_MANAGER_NO_CONFIG`, which the e2e suite sets), this module
 * reports it and nothing here reads or writes anything — the stores fall back to `localStorage`,
 * see `configStorage.ts`.
 */

interface ConfigDocument {
  /** Section name → its state, as read from the file (validated, never re-serialized on the way in). */
  sections: Partial<Record<ConfigSection, unknown>>
  /** Section name → the `zustand/persist` version its state was written at. */
  versions: Partial<Record<ConfigSection, number>>
}

const EMPTY: ConfigDocument = { sections: {}, versions: {} }

let document: ConfigDocument = EMPTY
let disabled = false
let loaded = false
let loading: Promise<void> | null = null

/** How long a burst of writes to the same section is coalesced. Settings inputs update their store
 * on every keystroke; one file write (and one IPC round trip the activity log records) per
 * character is waste. The first write of a burst still goes out immediately — a toggle or a theme
 * pick must not feel deferred. */
const WRITE_DEBOUNCE_MS = 250

/**
 * Reads the configuration file and adopts anything a pre-file version left in `localStorage`.
 *
 * Never rejects: a missing file is a fresh install, and an unreadable or malformed one is reported
 * and treated as absent (`validate.ts`), because a configuration the app can't parse must not be a
 * configuration the app can't start with.
 */
export function loadAppConfig(): Promise<void> {
  // Guarded on the promise, not on `loaded`: `loaded` is what flips the stores off `localStorage`
  // and must only be true once the document is actually in hand, while two callers racing the
  // load must still share one read.
  loading ??= readIntoDocument()
  return loading
}

async function readIntoDocument(): Promise<void> {
  const result = await apiReadAppConfig()
  disabled = result.disabled
  loaded = true
  if (disabled) return

  const parsed = parseDocument(result.contents)
  document = { sections: {}, versions: parsed.versions }

  for (const section of CONFIG_SECTIONS) {
    const stored = parsed.sections[section]
    if (stored !== undefined) {
      const { value, problems } = validateSection(section, stored)
      for (const problem of problems) console.warn(`Configuration: ${problem}`)
      if (value !== undefined) document.sections[section] = value
      continue
    }
    // No such section yet: adopt what the localStorage era left, once. The write below is what
    // makes it once — the next launch finds the section in the file and never looks back.
    const legacy = readLegacySection(section)
    if (legacy) {
      document.sections[section] = legacy.state
      document.versions[section] = legacy.version
      void writeNow(section, legacy.version, legacy.state)
    }
  }
}

function parseDocument(contents: string | null): {
  sections: Partial<Record<ConfigSection, unknown>>
  versions: Partial<Record<ConfigSection, number>>
} {
  if (!contents) return { sections: {}, versions: {} }
  try {
    const raw = JSON.parse(contents) as Record<string, unknown>
    const versions = (raw.versions ?? {}) as Partial<Record<ConfigSection, number>>
    return { sections: raw, versions }
  } catch (e) {
    // Reported, not repaired: the next write rebuilds the file (see `services/app_config.rs`), and
    // the user gets their defaults rather than a dead app.
    console.error('The configuration file could not be parsed; starting from defaults:', e)
    return { sections: {}, versions: {} }
  }
}

/** The `{ state, version }` envelope `zustand/persist` used to write to `localStorage`. */
function readLegacySection(
  section: ConfigSection
): { state: unknown; version: number } | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(SECTION_LEGACY_KEYS[section])
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { state?: unknown; version?: number }
    if (!parsed?.state || typeof parsed.state !== 'object') return undefined
    const adapt = SECTION_LEGACY_ADAPTERS[section]
    const { value } = validateSection(section, adapt ? adapt(parsed.state) : parsed.state)
    return value === undefined ? undefined : { state: value, version: parsed.version ?? 0 }
  } catch {
    return undefined
  }
}

/**
 * `true` when nothing may go through the configuration file — because it is switched off
 * (`GIT_MANAGER_NO_CONFIG`), or because it has not been read yet.
 *
 * The second case is what makes the file safe to introduce: until {@link loadAppConfig} has
 * answered, the app doesn't know whether there is a file at all, and a store that wrote in the
 * meantime would be writing into a document it hasn't seen. Both cases resolve the same way — the
 * store uses `localStorage`, as it always did. In the app it never happens: `main.tsx` awaits the
 * load before the first render. In a unit test it always does, which is why store suites can go on
 * asserting on `localStorage` without knowing this module exists.
 */
export function isConfigDisabled(): boolean {
  return disabled || !loaded
}

export function readConfigSection(
  section: ConfigSection
): { state: unknown; version?: number } | null {
  const state = document.sections[section]
  return state === undefined ? null : { state, version: document.versions[section] }
}

// ─── Writing ──────────────────────────────────────────────────────────────────

interface PendingWrite {
  version: number
  value: unknown
}

const pending = new Map<ConfigSection, PendingWrite>()
const timers = new Map<ConfigSection, ReturnType<typeof setTimeout>>()
const lastWriteAt = new Map<ConfigSection, number>()
let inFlight: Promise<unknown> = Promise.resolve()

function writeNow(section: ConfigSection, version: number, value: unknown): Promise<void> {
  lastWriteAt.set(section, Date.now())
  // `null` is a removal on both sides — the section leaves the file, and this window stops
  // reporting it as present, so a store that cleared its storage reads as never-configured.
  if (value === null) {
    delete document.sections[section]
    delete document.versions[section]
  } else {
    document.sections[section] = value
    document.versions[section] = version
  }
  const write = apiWriteAppConfigSection(section, version, value).catch((e) => {
    console.error(`Could not save the "${section}" section of the configuration:`, e)
  })
  inFlight = inFlight.then(() => write)
  return write
}

export function writeConfigSection(section: ConfigSection, version: number, value: unknown): void {
  if (disabled) return
  pending.set(section, { version, value })
  if (timers.has(section)) return

  const sinceLast = Date.now() - (lastWriteAt.get(section) ?? 0)
  if (sinceLast >= WRITE_DEBOUNCE_MS) {
    flushSection(section)
    return
  }
  timers.set(
    section,
    setTimeout(() => {
      timers.delete(section)
      flushSection(section)
    }, WRITE_DEBOUNCE_MS - sinceLast)
  )
}

function flushSection(section: ConfigSection): void {
  const write = pending.get(section)
  pending.delete(section)
  if (write) void writeNow(section, write.version, write.value)
}

/**
 * Writes everything still waiting on a debounce and resolves once it is on disk.
 *
 * Called when the window goes away, so a change made in the last fraction of a second before quit
 * isn't the one the user loses — and by the tests, which would otherwise have to wait out a timer.
 */
export async function flushConfigWrites(): Promise<void> {
  for (const [section, timer] of timers) {
    clearTimeout(timer)
    timers.delete(section)
    flushSection(section)
  }
  await inFlight
}

/** Best-effort save when the window is torn down. The unload handler can't await, which is what the
 * short debounce window is for. */
export function registerConfigFlushOnUnload(): void {
  globalThis.addEventListener?.('pagehide', () => {
    void flushConfigWrites()
  })
}

/** Test seam: drops the loaded document so the next {@link loadAppConfig} starts from nothing. */
export function resetAppConfigForTests(): void {
  document = { sections: {}, versions: {} }
  disabled = false
  loaded = false
  loading = null
  pending.clear()
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  lastWriteAt.clear()
  inFlight = Promise.resolve()
}
