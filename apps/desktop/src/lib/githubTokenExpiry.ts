/**
 * How close a connected GitHub token is to expiring, and where to go to replace it.
 *
 * A personal access token cannot be refreshed — it is an opaque secret with no refresh grant, so a
 * 90-day expiry is a hard wall the app can do exactly one useful thing about: say so early enough
 * that replacing it is a chore rather than an outage. That is what this file is for.
 */

/** How long before expiry the app starts warning — matched to GitHub's own reminder email. */
export const EXPIRY_WARNING_DAYS = 7

export type TokenExpiryLevel = 'expired' | 'expiring' | 'ok'

export interface TokenExpiryStatus {
  level: TokenExpiryLevel
  /** Whole days until expiry, rounded up, and negative once it has passed. */
  daysLeft: number
  expiresAt: Date
}

/**
 * Grades a token's expiry date, or `null` when there is nothing to grade — an account connected
 * before the app recorded expiry dates, or a token set never to expire. Both are indistinguishable
 * from here on purpose: neither has a date, and neither should show a warning.
 *
 * `now` is injectable because every interesting case of this function is a date relative to the
 * present, and a test that has to wait seven days is not a test.
 */
export function describeTokenExpiry(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): TokenExpiryStatus | null {
  if (!expiresAt) return null
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return null

  const msLeft = expiry.getTime() - now
  // Rounded up, so a token with eleven hours left reads "1 day" rather than "0": the number is a
  // deadline the user acts on, and rounding it down invents an expiry that has not happened yet.
  const daysLeft = Math.ceil(msLeft / 86_400_000)

  const level: TokenExpiryLevel =
    msLeft <= 0 ? 'expired' : daysLeft <= EXPIRY_WARNING_DAYS ? 'expiring' : 'ok'

  return { level, daysLeft, expiresAt: expiry }
}

/**
 * The scopes the app actually uses, as a classic personal access token needs them spelled out.
 *
 * `read:org` is the one that is not obvious and is why an organization account looks empty without
 * it. `workflow` is deliberately absent — the app never writes a workflow file through the API, and
 * a token that could is a privilege the user would be granting for nothing.
 */
export const CLASSIC_TOKEN_SCOPES = ['repo', 'read:org', 'read:user', 'user:email'] as const

/**
 * GitHub's "new classic token" page, pre-filled with the scopes above and a recognizable name.
 *
 * A classic token rather than a fine-grained one because this link exists for the case that forced
 * it: an organization with SAML SSO that has not opted into fine-grained tokens, where the classic
 * page is the only one offering the "Configure SSO → Authorize" step. The name is plain ("Git
 * Manager") because an organization owner sees this token in their authorized-credentials list, and
 * a token whose name does not say what it is is a token they are right to revoke.
 */
export function buildClassicTokenUrl(): string {
  const params = new URLSearchParams({
    scopes: CLASSIC_TOKEN_SCOPES.join(','),
    description: 'Git Manager',
  })
  return `https://github.com/settings/tokens/new?${params.toString()}`
}
