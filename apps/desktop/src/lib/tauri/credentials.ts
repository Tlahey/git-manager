import { invoke } from './invoke'

/**
 * The keychain, as seen from the webview: **write-only**.
 *
 * There is no `getCredential` here because there is no `get_credential` command, and there must
 * never be one. Every secret the app holds — a GitHub/GitLab/Bitbucket token, the AI provider's API
 * key — lives in the OS keychain, and the code that uses one reads it in Rust and puts it straight
 * on the wire. The frontend names an account; it cannot obtain the credential behind it.
 *
 * Writing is still possible because a secret has to arrive somehow: a token the user pastes, an API
 * key they type. That one-way trip is unavoidable. A way back out is not.
 *
 * See `src-tauri/src/services/credential_store.rs` for the full reasoning, including why this is a
 * service of our own rather than the `keyring` Tauri plugin (the plugin would expose a read).
 */
export type CredentialKind = 'github' | 'gitlab' | 'bitbucket' | 'ai'

/** The single id every AI provider key is stored under — there is one configured provider. */
export const AI_CREDENTIAL_ID = 'provider'

/** Stores (or replaces) a secret. An empty `secret` clears it. */
export const storeCredential = (kind: CredentialKind, id: string, secret: string) =>
  invoke<void>('store_credential', { kind, id, secret })

export const deleteCredential = (kind: CredentialKind, id: string) =>
  invoke<void>('delete_credential', { kind, id })

/**
 * Whether a secret is stored for this account — the one question about a credential the frontend is
 * allowed to ask, because the answer is a boolean rather than the credential.
 *
 * Worth asking: an account can be listed in the settings with nothing behind it in the keychain (an
 * item revoked by hand, a settings file copied to another machine), and the UI should say
 * "reconnect this account" rather than fire a request that comes back 401.
 */
export const hasCredential = (kind: CredentialKind, id: string) =>
  invoke<boolean>('has_credential', { kind, id })
