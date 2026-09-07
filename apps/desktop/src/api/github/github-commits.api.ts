import { ghGraphQL } from './githubApiShared'
import { cachedAvatars, rememberAvatars } from '../../lib/githubAvatarCache'

/**
 * Commit-level GitHub reads. Currently one: who wrote each commit, for the blame gutter's photos.
 *
 * # Why this is GraphQL, and why it used to be the app's worst burst of traffic
 *
 * This was a Rust command (`github_commit_avatars`) that looped over the SHAs and issued
 * `GET /repos/{owner}/{repo}/commits/{sha}` for each one, in series. Opening the blame of a file
 * with two hundred distinct authoring commits was therefore two hundred requests — against a budget
 * of five thousand an hour — and the caller's SWR key is the *joined list* of visible SHAs, so
 * scrolling the gutter re-issued all of them. Three files was most of an hour's quota.
 *
 * One aliased GraphQL query answers a hundred commits at once and is billed a single point, so the
 * same blame view costs two requests instead of two hundred. It also moved out of Rust in the
 * process, which is the more durable half of the fix: it now goes through `ghGraphQL` like every
 * other GitHub call, and so is subject to the rate-limit gate and feeds the quota and SSO stores it
 * previously bypassed entirely.
 *
 * The author is read as `author.user.avatarUrl` rather than `GitActor.avatarUrl`: the latter always
 * answers, inventing a generated identicon for a commit whose email matches no account, where the
 * REST field it replaces returned nothing. The UI's own fallback is initials, and a real one beats a
 * generated face.
 */

/** Aliases per query. Each `object(oid:)` is one node, so this is bounded by query size, not cost. */
const CHUNK_SIZE = 100

interface CommitAuthorNode {
  author?: { user?: { avatarUrl?: string | null } | null } | null
}

/**
 * Resolves `sha → avatar URL` for the given commits. SHAs whose author is not a GitHub user are
 * absent from the result, and the caller falls back to initials.
 *
 * Best-effort by design: a chunk that fails is logged and skipped rather than failing the whole
 * lookup, because a blame gutter with some photos is strictly better than one with none — and this
 * is decoration, never the reason the view exists.
 */
export async function fetchCommitAvatars(
  accountId: string,
  owner: string,
  repo: string,
  shas: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(shas)]
  const { known, missing } = cachedAvatars(owner, repo, unique)
  if (missing.length === 0) return known

  const resolved: Record<string, string> = {}
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE)
    try {
      Object.assign(resolved, await fetchChunk(accountId, owner, repo, chunk))
      // Remembered per chunk, so a later chunk failing does not throw away what the earlier ones
      // already learned.
      rememberAvatars(owner, repo, chunk, resolved)
    } catch (e) {
      console.warn(`[github] commit avatars for ${owner}/${repo} (${chunk.length} commits)`, e)
    }
  }
  return { ...known, ...resolved }
}

async function fetchChunk(
  accountId: string,
  owner: string,
  repo: string,
  shas: string[]
): Promise<Record<string, string>> {
  // The alias has to be a GraphQL name, so it is positional (`c0`, `c1`…) rather than the SHA — and
  // the oid goes in a variable rather than the query text, which keeps a SHA from ever being
  // interpolated into a document.
  const fields = shas
    .map((_, i) => `c${i}: object(oid:$oid${i}){ ... on Commit { author { user { avatarUrl } } } }`)
    .join('\n')
  const declarations = shas.map((_, i) => `$oid${i}:GitObjectID!`).join(',')
  const query = `query($owner:String!,$repo:String!,${declarations}){
    repository(owner:$owner,name:$repo){
      ${fields}
    }
  }`

  const variables: Record<string, unknown> = { owner, repo }
  shas.forEach((sha, i) => {
    variables[`oid${i}`] = sha
  })

  const data = await ghGraphQL<{ repository: Record<string, CommitAuthorNode | null> | null }>(
    query,
    variables,
    accountId
  )

  const avatars: Record<string, string> = {}
  shas.forEach((sha, i) => {
    const url = data.repository?.[`c${i}`]?.author?.user?.avatarUrl
    if (url) avatars[sha] = url
  })
  return avatars
}
