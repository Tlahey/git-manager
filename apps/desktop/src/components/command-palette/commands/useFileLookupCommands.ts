import { createElement } from 'react'
import { FileText } from 'lucide-react'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useTrackedFiles } from '../../../hooks/useTrackedFiles'
import { apiGetFileHistory } from '../../../api/git.api'
import type { PaletteCommand } from './types'

/** Below this many characters the query is too broad to be a useful file search. */
const MIN_QUERY_LENGTH = 2
/** Cap the number of file results so the palette stays snappy on large repos. */
const MAX_RESULTS = 20

/** Splits a repo-relative path into `{ dir, name }` (dir keeps no trailing slash). */
function splitPath(path: string): { dir: string; name: string } {
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash === -1) return { dir: '', name: path }
  return { dir: path.slice(0, lastSlash), name: path.slice(lastSlash + 1) }
}

/**
 * Ranks a path against a lowercased query: basename hits beat path-only hits, a basename that starts
 * with the query beats one that merely contains it, and shorter paths win ties. Lower score is
 * better; `null` means no match. Kept pure and exported for unit testing.
 */
export function scoreFileMatch(path: string, query: string): number | null {
  const name = splitPath(path).name.toLowerCase()
  const lowerPath = path.toLowerCase()
  if (name.startsWith(query)) return path.length
  if (name.includes(query)) return 1000 + path.length
  if (lowerPath.includes(query)) return 2000 + path.length
  return null
}

/** Filters + ranks tracked paths for the query, returning at most `MAX_RESULTS` best matches. */
export function rankFileMatches(files: string[], query: string): string[] {
  const scored: { path: string; score: number }[] = []
  for (const path of files) {
    const score = scoreFileMatch(path, query)
    if (score !== null) scored.push({ path, score })
  }
  scored.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
  return scored.slice(0, MAX_RESULTS).map((s) => s.path)
}

/**
 * File-lookup palette commands: fuzzy-match the query against the repo's tracked files and, on
 * select, open the file's latest committed version in the center panel (File tab) with the History
 * panel alongside — the "search a file to see its contents and history" entry point.
 *
 * The tracked-file list is fetched lazily via SWR; because this hook only mounts while the palette
 * dialog is open, the fetch happens on first open rather than on every repo view.
 */
export function useFileLookupCommands(query: string): PaletteCommand[] {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)

  const { data: files } = useTrackedFiles(activeRepo)

  const normalized = query.trim().toLowerCase()
  if (!activeRepo || normalized.length < MIN_QUERY_LENGTH || !files) return []

  const repo = activeRepo
  return rankFileMatches(files, normalized).map((path) => {
    const { dir, name } = splitPath(path)
    return {
      id: `file-lookup-${path}`,
      group: 'files',
      title: name,
      // The full path is the cmdk value (basenames aren't unique) and is also fuzzy-matchable.
      value: path,
      subtitle: dir || undefined,
      keywords: [path],
      icon: createElement(FileText),
      run: async () => {
        // Open the file at its latest commit so the diff viewer always has content to show (a clean
        // working-tree file has no diff of its own). Fall back to the working-tree version if the
        // file has no history yet (e.g. staged but never committed).
        let latestOid: string | undefined
        try {
          const history = await apiGetFileHistory(repo, path, 1)
          latestOid = history[0]?.oid
        } catch {
          latestOid = undefined
        }
        setActiveDiffFile({ path, staged: false, oid: latestOid, initialTab: 'file' })
        setActiveLeftPanel('history')
      },
    }
  })
}
