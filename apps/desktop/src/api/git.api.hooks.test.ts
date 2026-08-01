/**
 * The three push paths that do not go through `trackTransfer`, and therefore do not get its
 * hook-aware failure card for free: a ref drag, publishing a tag, and deleting a remote tag.
 *
 * Their callers render `String(error)`, which for a refused hook is the serialized `AppError`
 * JSON rather than the lines the hook printed — so what is asserted here is that the card carrying
 * that output is raised, and that the error still reaches the caller untouched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppErrorLike } from '../lib/tauri'
import { useNotchQueueStore } from '../stores/notchQueue.store'

vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return {
    ...actual,
    pushBranchTo: vi.fn(),
    pushTag: vi.fn(),
    deleteRemoteTag: vi.fn(),
  }
})

import { apiDeleteRemoteTag, apiPushBranchTo, apiPushTag } from './git.api'
import { deleteRemoteTag, pushBranchTo, pushTag } from '../lib/tauri'

/** What a refused `pre-push` looks like once `AppError::HookFailed` has crossed the IPC boundary. */
function hookRejection(): Error {
  const error = new Error('The pre-push hook stopped the operation') as Error & AppErrorLike
  error.code = 'HOOK_FAILED'
  error.detail = 'pre-push: refusing to push refs/heads/release\n  this branch is protected'
  return error
}

const REPO = '/tmp/repo-under-test'

beforeEach(() => {
  vi.clearAllMocks()
  useNotchQueueStore.getState().clear()
})

describe.each([
  ['a ref drag', () => apiPushBranchTo(REPO, 'main', 'release'), pushBranchTo],
  ['publishing a tag', () => apiPushTag(REPO, 'v1.0.0'), pushTag],
  ['deleting a remote tag', () => apiDeleteRemoteTag(REPO, 'v1.0.0'), deleteRemoteTag],
])('%s refused by pre-push', (_label, call, mocked) => {
  it('puts the hook’s own output on the notch', async () => {
    vi.mocked(mocked).mockRejectedValue(hookRejection())

    await expect(call()).rejects.toThrow()

    const current = useNotchQueueStore.getState().queue.current
    expect(current?.model.tone).toBe('error')
    // The lines the hook printed, not the serialized error — the whole reason the card exists.
    expect(current?.model).toMatchObject({
      outputLines: [
        'pre-push: refusing to push refs/heads/release',
        'this branch is protected',
      ],
    })
  })

  it('still rethrows, so the caller’s own dialog or toast keeps working', async () => {
    const rejection = hookRejection()
    vi.mocked(mocked).mockRejectedValue(rejection)

    await expect(call()).rejects.toBe(rejection)
  })

  it('raises nothing when the push succeeds', async () => {
    vi.mocked(mocked).mockResolvedValue(undefined)

    await call()

    expect(useNotchQueueStore.getState().queue.current).toBeNull()
  })

  // A rejected push that no hook refused — a network failure, a non-fast-forward — is the caller's
  // business as it always was; a card here would be a second, worse copy of its error.
  it('raises no card for a failure that is not a hook', async () => {
    vi.mocked(mocked).mockRejectedValue(new Error('failed to connect to origin'))

    await expect(call()).rejects.toThrow()

    expect(useNotchQueueStore.getState().queue.current).toBeNull()
  })
})
