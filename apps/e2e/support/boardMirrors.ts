import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The board feature's disaster-recovery mirrors, which live **outside** every repository — one bare
 * git repo per board under `$HOME/.git-manager/boards/<repo-slug>/<board-id>.git` (see
 * `services/git_board.rs`).
 *
 * They are the one piece of board state a fixture rebuild cannot touch: `fixture_init` wipes the
 * repository and nothing else, so every board any scenario has ever created stays "recoverable"
 * for the rest of the run — the app under test then shows a banner offering nine identical
 * "Sprint 12", and a `@doc` capture taken afterwards publishes that pile to the documentation.
 *
 * `$HOME` is the run's own scratch home (`useIsolatedHome`), inherited by this worker from the
 * launcher, so nothing here can reach a developer's real backups whatever their `$HOME` is. The slug
 * cannot be recomputed in Node — `utils.rs`'s `repo_slug` hashes the path with Rust's own
 * `DefaultHasher` — so the directories are matched by their readable `<name>-<hash>` prefix instead.
 */
const E2E_HOME = '/tmp/git-manager-e2e-home'

function boardsRoot(): string {
  return join(process.env.HOME ?? E2E_HOME, '.git-manager', 'boards')
}

/** Every mirror directory of the run, or those of one fixture when `fixtureName` is given. */
export function boardMirrorDirs(fixtureName?: string): string[] {
  const root = boardsRoot()
  if (!existsSync(root)) return []
  const prefix = fixtureName ? `${fixtureName}-` : ''
  return readdirSync(root)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(root, name))
}

/** Every bare mirror repository held for `fixtureName`, one per board ever written to it. */
export function boardMirrorRepos(fixtureName: string): string[] {
  return boardMirrorDirs(fixtureName).flatMap((dir) =>
    readdirSync(dir)
      .filter((entry) => entry.endsWith('.git'))
      .map((entry) => join(dir, entry))
  )
}

/**
 * Drops the mirrors, so a scenario starts with nothing to recover.
 *
 * Called from the per-scenario `Before` hook rather than only from the scenario that asserts on
 * them: leaving them is what puts a growing "N boards can be restored" banner over every later board
 * scenario, including the documented ones. Plain filesystem work, so it costs the hook no driver
 * round trip — the thing `scenarioBaseline.ts` is careful about.
 */
export function clearBoardMirrors(fixtureName?: string): void {
  for (const dir of boardMirrorDirs(fixtureName)) rmSync(dir, { recursive: true, force: true })
}
