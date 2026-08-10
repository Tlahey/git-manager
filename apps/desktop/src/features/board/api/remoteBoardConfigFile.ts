import type { Board } from '@git-manager/git-types'
import { readBoardConfig, writeBoardConfig } from '../../../lib/tauri'

/**
 * `.git-manager/board.json` — the remote board's structure, committed to the repository like any
 * other file.
 *
 * Reading it is where every board written by an older version is brought up to the current shape,
 * and that is why this is its own module rather than two lines inside the backend: each default
 * below stands for a release, and a reader needs to see them together to know what "an old board"
 * can be missing. The repair is silent and total — the rest of the app never sees a partial board.
 *
 * A malformed or absent file reads as "no boards" rather than throwing. The file is committed, so
 * it can arrive broken from a bad merge; refusing to open the repository over it would be a worse
 * answer than showing an empty board list the user can rebuild.
 */

export interface RemoteBoardConfigFile {
  boards: Board[]
}

/** A board as some earlier version may have written it: the fields below post-date the format. */
type LegacyBoard = Partial<Board> & { cardPrefix?: string }

export async function readConfigFile(path: string): Promise<RemoteBoardConfigFile> {
  const raw = await readBoardConfig(path)
  if (!raw) return { boards: [] }
  try {
    const parsed: unknown = JSON.parse(raw)
    const boards = (parsed as Partial<RemoteBoardConfigFile> | null)?.boards
    if (!Array.isArray(boards)) return { boards: [] }
    return { boards: boards.map(migrateBoard) }
  } catch {
    return { boards: [] }
  }
}

export async function writeConfigFile(path: string, config: RemoteBoardConfigFile): Promise<void> {
  await writeBoardConfig(path, JSON.stringify(config, null, 2))
}

/** Fills in everything a board written before the current format would be missing. */
function migrateBoard(b: LegacyBoard): Board {
  return {
    ...b,
    // Boards written before tags/DOD templates existed lack those keys.
    tags: b.tags ?? [],
    dodTemplate: b.dodTemplate ?? '',
    // A config written before per-card prefixes carries a single `cardPrefix`. An empty one is
    // dropped rather than becoming a prefix of `''`, which would number every card `-1`.
    cardPrefixes: b.cardPrefixes ?? (b.cardPrefix ? [b.cardPrefix] : []),
    nextCardNumbers: b.nextCardNumbers ?? {},
  } as Board
}

/**
 * Short, label-safe id — no uuid dependency, mirrors `git_board.rs`'s dependency-free id
 * generation. Must stay short: it's embedded in every card's label (`board:<id>:status:<col>`),
 * which has to fit under GitHub's 50-character label limit alongside the column id.
 */
export function generateBoardId(): string {
  let hash = 0
  const seed = `${Date.now()}-${Math.random()}`
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}
