import {
  getBisectState,
  bisectCheckRange,
  bisectStart,
  bisectMark,
  bisectReset,
} from '../../lib/tauri'
import type { BisectTerm } from '@git-manager/git-types'
import { closeActivitySession, openActivitySession } from '../../lib/activityCorrelation'

export async function apiGetBisectState(path: string) {
  return getBisectState(path)
}

export async function apiBisectCheckRange(path: string, badRev: string, goodRev: string) {
  return bisectCheckRange(path, badRev, goodRev)
}

export async function apiBisectStart(path: string, badRev: string, goodRev: string) {
  // A bisect is the other operation git keeps on-disk state for, so the journal treats it the same
  // way: one block from `start` through every `mark` to the `reset` that ends it.
  openActivitySession(path, 'bisect')
  return bisectStart(path, badRev, goodRev)
}

export async function apiBisectMark(path: string, term: BisectTerm) {
  openActivitySession(path, 'bisect')
  return bisectMark(path, term)
}

export async function apiBisectReset(path: string) {
  openActivitySession(path, 'bisect')
  try {
    return await bisectReset(path)
  } finally {
    // `reset` is the only thing that ends a bisect — git keeps the session alive even after the first
    // bad commit is found — so it is the one place this closes, and it closes either way.
    closeActivitySession(path)
  }
}
