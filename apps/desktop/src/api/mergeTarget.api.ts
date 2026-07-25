import { getMergeTargetStatus } from '../lib/tauri'

/**
 * How the checked-out branch of `path` relates to its merge target: `candidates` is the repo's
 * configured target branches (most specific first) and the first one that exists wins. A read-only
 * probe — the backend only simulates the merge in memory, so this is safe to poll.
 */
export async function apiGetMergeTargetStatus(path: string, candidates: string[]) {
  return getMergeTargetStatus(path, candidates)
}
