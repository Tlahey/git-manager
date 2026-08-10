import { useCallback, useRef, useState } from 'react'

export interface BulkRepoError {
  path: string
  message: string
}

export interface BulkRunState {
  isRunning: boolean
  /** How many repos have been attempted so far, successful or not. */
  done: number
  total: number
  errors: BulkRepoError[]
}

const IDLE: BulkRunState = { isRunning: false, done: 0, total: 0, errors: [] }

/**
 * Runs one async operation over a list of repositories, for the dashboard's section-wide Fetch /
 * Pull / Open-in-editor buttons.
 *
 * Two deliberate choices:
 * - **Sequential, not `Promise.all`.** These are network and credential operations; firing a dozen
 *   at once can trigger as many SSH passphrase prompts and hammer the remote.
 * - **One failure never stops the run.** A single unreachable remote or diverged branch must not
 *   prevent the other repos from being fetched, so errors are collected per repo and returned
 *   together once every repo has been attempted.
 */
export function useBulkRepoAction(): {
  state: BulkRunState
  run: (paths: string[], op: (path: string) => Promise<unknown>) => Promise<BulkRunState>
  reset: () => void
} {
  const [state, setState] = useState<BulkRunState>(IDLE)
  // Guards against a second run being started from a double click while one is in flight.
  const runningRef = useRef(false)

  const reset = useCallback(() => setState(IDLE), [])

  const run = useCallback(async (paths: string[], op: (path: string) => Promise<unknown>) => {
    if (runningRef.current || paths.length === 0) return IDLE
    runningRef.current = true

    const errors: BulkRepoError[] = []
    setState({ isRunning: true, done: 0, total: paths.length, errors: [] })

    for (const [index, path] of paths.entries()) {
      try {
        await op(path)
      } catch (err) {
        errors.push({ path, message: err instanceof Error ? err.message : String(err) })
      }
      setState({
        isRunning: true,
        done: index + 1,
        total: paths.length,
        errors: [...errors],
      })
    }

    const final = { isRunning: false, done: paths.length, total: paths.length, errors }
    setState(final)
    runningRef.current = false
    return final
  }, [])

  return { state, run, reset }
}
