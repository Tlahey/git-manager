import {
  AI_CREDENTIAL_ID,
  deleteCredential,
  hasCredential,
  storeCredential,
  type CredentialKind,
} from '../lib/tauri'

/**
 * The keychain, as the rest of the app sees it: **you may write a secret, and you may ask whether
 * one exists. You may not read one.**
 *
 * There is no `getCredential` here, and there is no command behind one either. Everything that needs
 * a token — the GitHub proxy, the AI provider, the GitLab/Bitbucket calls — reads it in Rust and
 * puts it straight on the wire. See `src-tauri/src/services/credential_store.rs` for the reasoning.
 *
 * Every credential is keyed by (kind, id). The three forge kinds use the account id — which is the
 * user's login, i.e. public — and the AI provider has a single fixed slot, so callers pass no id for
 * it.
 */

/** The single account slot each kind stores under, for kinds that only ever have one. */
function resolveId(kind: CredentialKind, id?: string): string {
  if (kind === 'ai') return AI_CREDENTIAL_ID
  if (!id) throw new Error(`A ${kind} credential needs an account id`)
  return id
}

/** Stores (or replaces) a secret. An empty value clears it. */
export async function apiStoreCredential(
  kind: CredentialKind,
  secret: string,
  id?: string
): Promise<void> {
  return storeCredential(kind, resolveId(kind, id), secret)
}

export async function apiDeleteCredential(kind: CredentialKind, id?: string): Promise<void> {
  return deleteCredential(kind, resolveId(kind, id))
}

/** Whether a secret is stored — a boolean, which is the only thing about a credential the frontend
 * is allowed to learn. */
export async function apiHasCredential(kind: CredentialKind, id?: string): Promise<boolean> {
  return hasCredential(kind, resolveId(kind, id))
}

export type { CredentialKind }
