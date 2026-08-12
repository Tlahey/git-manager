import { apiStoreCredential } from '../../api/credentials.api'
import type { CredentialKind } from '../tauri'
import { isConfigDisabled, readConfigSection, writeConfigSection } from './appConfigFile'
import { SECTION_LEGACY_KEYS } from './sections'

/**
 * The one-time move of every secret out of the settings and into the OS keychain.
 *
 * Until this shipped, `~/.git-manager/settings.json` held the GitHub/GitLab/Bitbucket tokens and the
 * AI provider's API key in clear text (and before that file existed, `localStorage` did). They now
 * live in the keychain, reachable only from Rust — but an install that predates the change still has
 * them on disk, and its user must not have to reconnect every account to keep working.
 *
 * So on the first launch that finds one, each secret is written to the keychain and removed from the
 * settings. Runs once by construction rather than by a flag: it only acts on secrets it *finds*, and
 * having moved them there is nothing left to find. That also makes it self-healing — a settings file
 * restored from an old backup is migrated again the next time it is read.
 *
 * # Where it runs, and why there
 *
 * Between `loadAppConfig()` and the stores' rehydration (see `hydrate.ts`). Any earlier and there is
 * no document to read; any later and the settings store has already published a state carrying the
 * tokens, so every consumer would see them for a frame and the stripped version would arrive as a
 * second render. Running in the gap means the store is *born* clean.
 *
 * # Failure is not fatal
 *
 * A keychain that refuses (locked, unavailable, the user declining the access prompt) leaves the
 * settings untouched and the app starts normally — with accounts that cannot authenticate until the
 * next launch tries again. Stripping a token we failed to store would destroy a credential, which is
 * strictly worse than leaving one where it has been all along.
 */

/** One secret to move: which keychain namespace, under which id, with what value. */
export interface PendingSecret {
  kind: CredentialKind
  /** Absent for `ai`, which has a single slot — see `api/credentials.api.ts`. */
  id?: string
  secret: string
}

interface LegacyAccount {
  id?: unknown
  token?: unknown
}

interface LegacySettings {
  ai?: { apiKey?: unknown } & Record<string, unknown>
  github?: { accounts?: unknown } & Record<string, unknown>
  integrations?: {
    gitlabAccounts?: unknown
    bitbucketAccounts?: unknown
  } & Record<string, unknown>
  [key: string]: unknown
}

export interface ExtractionResult {
  /** What to write to the keychain, in the order found. */
  secrets: PendingSecret[]
  /** The same settings with every secret removed. Structurally shared where nothing changed. */
  stripped: unknown
}

function stripAccounts(
  accounts: unknown,
  kind: CredentialKind,
  secrets: PendingSecret[]
): { accounts: unknown; changed: boolean } {
  if (!Array.isArray(accounts)) return { accounts, changed: false }
  let changed = false
  const next = accounts.map((entry) => {
    const account = entry as LegacyAccount
    if (typeof account?.token !== 'string' || account.token === '') return entry
    changed = true
    // An account with no id cannot be filed anywhere, so its token is dropped rather than stored
    // under a guessed key — the user reconnects that one account. It should not happen: the id is
    // written at the same moment as the token.
    if (typeof account.id === 'string' && account.id !== '') {
      secrets.push({ kind, id: account.id, secret: account.token })
    }
    const { token: _token, ...rest } = account as Record<string, unknown>
    void _token
    return rest
  })
  return { accounts: next, changed }
}

/**
 * Splits a settings object into the secrets it still carries and a copy without them.
 *
 * Pure, and deliberately tolerant of any shape: it runs against whatever an older build wrote,
 * including a file someone edited by hand, so every field is checked rather than assumed.
 */
export function extractSecrets(raw: unknown): ExtractionResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { secrets: [], stripped: raw }
  const settings = raw as LegacySettings
  const secrets: PendingSecret[] = []
  const next: LegacySettings = { ...settings }
  let changed = false

  if (settings.github && typeof settings.github === 'object') {
    const { accounts, changed: didChange } = stripAccounts(
      settings.github.accounts,
      'github',
      secrets
    )
    if (didChange) {
      next.github = { ...settings.github, accounts }
      changed = true
    }
  }

  if (settings.integrations && typeof settings.integrations === 'object') {
    const gitlab = stripAccounts(settings.integrations.gitlabAccounts, 'gitlab', secrets)
    const bitbucket = stripAccounts(settings.integrations.bitbucketAccounts, 'bitbucket', secrets)
    if (gitlab.changed || bitbucket.changed) {
      next.integrations = {
        ...settings.integrations,
        gitlabAccounts: gitlab.accounts,
        bitbucketAccounts: bitbucket.accounts,
      }
      changed = true
    }
  }

  if (settings.ai && typeof settings.ai === 'object' && typeof settings.ai.apiKey === 'string') {
    // A blank key is removed but not stored: it is the absence of a key, spelled long-hand by a
    // settings form that used to write the field on every keystroke.
    if (settings.ai.apiKey !== '') {
      secrets.push({ kind: 'ai', secret: settings.ai.apiKey })
    }
    const { apiKey: _apiKey, ...rest } = settings.ai
    void _apiKey
    next.ai = rest
    changed = true
  }

  return { secrets, stripped: changed ? next : raw }
}

/** The `{ state, version }` envelope a store persists to `localStorage` when the file is off. */
function readLegacyLocalStorage(): { state: unknown; version: number } | null {
  try {
    const raw = globalThis.localStorage?.getItem(SECTION_LEGACY_KEYS.settings)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: unknown; version?: number }
    // The pre-file envelope wrapped the settings once more (`{ state: { settings: … } }`); the file
    // dropped that wrapper. Accept both, because this is exactly the vintage of install that still
    // has tokens to move.
    const state = (parsed?.state as { settings?: unknown })?.settings ?? parsed?.state
    return state && typeof state === 'object' ? { state, version: parsed.version ?? 0 } : null
  } catch {
    return null
  }
}

/**
 * Moves every secret still in the settings into the keychain, and rewrites the settings without
 * them. Returns how many were moved, for the log line — and for the tests.
 *
 * Nothing is stripped until *every* secret has been stored: a partial write would leave the file
 * short of a token that never arrived in the keychain, which is the one outcome worse than not
 * migrating at all.
 *
 * **Never rejects.** `main.tsx` awaits `hydrateConfigStores()` before the first render, so anything
 * that throws in here is a blank window — and a failed migration is a recoverable annoyance
 * (accounts that need reconnecting, retried next launch) where a blank window is not. That covers
 * the keychain refusing, but also a settings blob shaped in a way `extractSecrets` did not expect:
 * this reads a file the user can edit by hand, and no such file may be able to stop the app.
 */
export async function migrateSecretsOutOfSettings(): Promise<number> {
  try {
    return await run()
  } catch (e) {
    console.error('Could not migrate the stored credentials; leaving the settings untouched:', e)
    return 0
  }
}

async function run(): Promise<number> {
  const usingFile = !isConfigDisabled()
  const source = usingFile
    ? readConfigSection('settings')
    : (readLegacyLocalStorage() as { state: unknown; version?: number } | null)
  if (!source) return 0

  const { secrets, stripped } = extractSecrets(source.state)
  if (secrets.length === 0) return 0

  try {
    for (const { kind, id, secret } of secrets) {
      await apiStoreCredential(kind, secret, id)
    }
  } catch (e) {
    console.error(
      'Could not move the stored credentials into the keychain; leaving the settings untouched and retrying on the next launch:',
      e
    )
    return 0
  }

  if (usingFile) {
    writeConfigSection('settings', source.version ?? 0, stripped)
  } else {
    // The file is off (`GIT_MANAGER_NO_CONFIG`), so the settings store persists to localStorage and
    // this writes back the same envelope it read — flattened to the shape the store reads today.
    globalThis.localStorage?.setItem(
      SECTION_LEGACY_KEYS.settings,
      JSON.stringify({ state: stripped, version: source.version ?? 0 })
    )
  }

  console.info(
    `Moved ${secrets.length} stored credential(s) out of the settings and into your keychain.`
  )
  return secrets.length
}
