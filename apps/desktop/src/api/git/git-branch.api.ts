import {
  getBranches,
  checkoutBranch,
  deleteBranch,
  deleteRemoteBranch,
  mergeBranch,
  fastForwardBranch,
  setBranchUpstream,
  pushBranchTo,
  pinObject,
  snapshotWorktree,
  type WorktreeSnapshot,
  getTagContainingCommit,
  isCommitOnCurrentBranch,
  getTags,
  createBranch,
  renameBranch,
  createTag,
  deleteTag,
  deleteRemoteTag,
  pushTag,
  getTagWebUrl,
  getBranchWebUrl,
} from '../../lib/tauri'
import { runActivity } from '../../lib/activityCorrelation'
import { generateId, pushAction, clearRedo, withHookFailureCard } from './gitApiShared'

// ─── Checkout ──────────────────────────────────────────────────────────────

/** Where the checkout comes from — needed to record an undoable action (and to pin the commit
 * left behind when leaving a detached HEAD). Omitted for a checkout that shouldn't be undoable. */
export interface CheckoutOpts {
  fromRef: string
  fromDetached: boolean
  force?: boolean
}

export async function apiCheckoutBranch(path: string, toRef: string, opts?: CheckoutOpts) {
  return runActivity('git.checkout', async () => {
    const force = opts?.force ?? false
    const id = generateId()
    let snapshot: WorktreeSnapshot | null = null
    if (force) {
      snapshot = await snapshotWorktree(path, id)
    }
    if (opts?.fromDetached) {
      // The detached commit won't be referenced by any branch anymore once we leave it.
      await pinObject(path, `${id}-detached`, opts.fromRef).catch(() => {})
    }

    await checkoutBranch(path, toRef, force)

    if (opts) {
      const pinnedRefs: string[] = []
      if (snapshot) pinnedRefs.push(snapshot.indexRefName, snapshot.workdirRefName)
      if (opts.fromDetached) pinnedRefs.push(`${id}-detached`)

      pushAction(path, {
        id,
        timestamp: Date.now(),
        label: { key: 'undoRedo.checkout', params: { branch: toRef } },
        pinnedRefs,
        type: 'checkout',
        fromRef: opts.fromRef,
        toRef,
        force,
        snapshot,
      })
    } else {
      clearRedo(path)
    }
  })
}

// ─── Ref drag-and-drop integrations ──────────────────────────────────────────

/** Merges `source` into `target` (checks out `target` first). Rewrites the target ref, so
 * the snapshot-based undo doesn't apply — clear the redo stack like the other rewriting ops. */
export async function apiMergeBranch(path: string, source: string, target: string) {
  await mergeBranch(path, source, target)
  clearRedo(path)
}

/** Fast-forwards `target` up to `source` (ff-only; rejected if not an ancestor). */
export async function apiFastForwardBranch(path: string, source: string, target: string) {
  await fastForwardBranch(path, source, target)
  clearRedo(path)
}

/** Pushes local branch `source` to remote branch `target` (refspec `source:target`). */
export async function apiPushBranchTo(
  path: string,
  source: string,
  target: string,
  remote?: string,
  force?: boolean
) {
  await withHookFailureCard(path, () => pushBranchTo(path, source, target, remote, force))
}

// ─── Delete branch ─────────────────────────────────────────────────────────

export async function apiDeleteBranch(
  path: string,
  name: string,
  opts: { targetOid: string; upstream?: string; force?: boolean; deleteRemote?: boolean }
) {
  const id = generateId()
  // Pin before deleting: once the ref is gone, this commit can become unreachable.
  await pinObject(path, id, opts.targetOid).catch(() => {})

  await deleteBranch(path, name, opts.force ?? false, opts.deleteRemote ?? false)

  pushAction(path, {
    id,
    timestamp: Date.now(),
    label: { key: 'undoRedo.deleteBranch', params: { branch: name } },
    pinnedRefs: [id],
    type: 'deleteBranch',
    name,
    targetOid: opts.targetOid,
    upstream: opts.upstream,
  })
}

/** Deletes branch `branchName` on `remote` (default "origin") — `git push origin :refs/heads/<name>`. */
export async function apiDeleteRemoteBranch(path: string, branchName: string, remote?: string) {
  return withHookFailureCard(path, () => deleteRemoteBranch(path, branchName, remote))
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function apiGetBranches(path: string, includeRemote = true) {
  return getBranches(path, includeRemote)
}

export async function apiGetTagContainingCommit(path: string, oid: string) {
  return getTagContainingCommit(path, oid)
}

export async function apiIsCommitOnCurrentBranch(path: string, oid: string) {
  return isCommitOnCurrentBranch(path, oid)
}

export async function apiGetTags(path: string) {
  return getTags(path)
}

// ─── Branch creation ───────────────────────────────────────────────────────

export async function apiCreateBranch(path: string, name: string, fromRef: string) {
  await createBranch(path, name, fromRef)

  let targetOid: string | null = null
  try {
    const branches = await getBranches(path, false)
    targetOid = branches.find((b) => b.name === name)?.commitOid ?? null
  } catch {
    targetOid = null
  }

  if (targetOid) {
    const id = generateId()
    await pinObject(path, id, targetOid).catch(() => {})
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.createBranch', params: { branch: name } },
      pinnedRefs: [id],
      type: 'createBranch',
      name,
      targetOid,
    })
  } else {
    clearRedo(path)
  }
}

// ─── Branch rename ─────────────────────────────────────────────────────────

/** Renames a local branch. Not snapshot-undoable (a rename back restores it), so only clears redo. */
export async function apiRenameBranch(path: string, oldName: string, newName: string) {
  await renameBranch(path, oldName, newName)
  clearRedo(path)
}

// ─── Set upstream ────────────────────────────────────────────────────────────

/** Sets local branch `name`'s upstream to `upstream` (a remote-tracking branch's short name, e.g.
 * `origin/main`). Metadata-only — nothing to snapshot, so it only clears redo like the branch's
 * other non-rewriting relationship actions (rename, fast-forward). */
export async function apiSetBranchUpstream(path: string, name: string, upstream: string) {
  await setBranchUpstream(path, name, upstream)
  clearRedo(path)
}

// ─── Tag creation ──────────────────────────────────────────────────────────

export async function apiCreateTag(path: string, name: string, fromRef: string, message?: string) {
  await createTag(path, name, fromRef, message)

  let targetOid: string | null = null
  try {
    const tags = await getTags(path)
    targetOid = tags.find((t) => t.shortName === name)?.commitOid ?? null
  } catch {
    targetOid = null
  }

  if (targetOid) {
    const id = generateId()
    await pinObject(path, id, targetOid).catch(() => {})
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.createTag', params: { tag: name } },
      pinnedRefs: [id],
      type: 'createTag',
      name,
      targetOid,
      message,
    })
  } else {
    clearRedo(path)
  }
}

/**
 * Deletes a local tag, pushing an undo entry that recreates it on `targetOid`. Pass `message` when
 * the tag is annotated so the undo restores an annotated tag; otherwise it is recreated lightweight.
 */
export async function apiDeleteTag(
  path: string,
  name: string,
  opts: { targetOid: string; message?: string }
) {
  const id = generateId()
  // Pin before deleting: once the ref is gone, this commit can become unreachable.
  await pinObject(path, id, opts.targetOid).catch(() => {})

  await deleteTag(path, name)

  pushAction(path, {
    id,
    timestamp: Date.now(),
    label: { key: 'undoRedo.deleteTag', params: { tag: name } },
    pinnedRefs: [id],
    type: 'deleteTag',
    name,
    targetOid: opts.targetOid,
    message: opts.message,
  })
}

/**
 * Turns an existing tag into an annotated one by recreating it with `message` on the same commit
 * (`git tag -d` + `git tag -a`). A replacement rather than an in-place edit, so it clears the redo
 * stack instead of pushing an invertible entry.
 */
export async function apiAnnotateTag(path: string, name: string, oid: string, message: string) {
  await deleteTag(path, name)
  await createTag(path, name, oid, message)
  clearRedo(path)
}

/** Deletes a tag on the remote (default "origin"). A network op, so it pushes no undo entry. */
export async function apiDeleteRemoteTag(path: string, tagName: string, remote?: string) {
  return withHookFailureCard(path, () => deleteRemoteTag(path, tagName, remote))
}

/** Publishes a tag to the remote (default "origin"). A network op, so it pushes no undo entry. */
export async function apiPushTag(path: string, tagName: string, remote?: string) {
  return withHookFailureCard(path, () => pushTag(path, tagName, remote))
}

/**
 * Re-points an existing tag at `oid`, keeping its name — the tag equivalent of a fast-forward.
 *
 * git has no "move a tag" primitive: it is a delete followed by a re-create, which is exactly what
 * {@link apiAnnotateTag} already does to attach a message. Only the local tag moves; the remote
 * still holds the old target until the tag is force-pushed, which this deliberately does not do.
 */
export async function apiMoveTag(path: string, tagName: string, oid: string) {
  await deleteTag(path, tagName)
  await createTag(path, tagName, oid)
  clearRedo(path)
}

/** The tag's GitHub release page URL on the remote (default "origin"), or null if unavailable. */
export async function apiGetTagWebUrl(path: string, tagName: string, remote?: string) {
  return getTagWebUrl(path, tagName, remote)
}

/** The branch's GitHub tree page URL on the remote (default "origin"), or null if unavailable. */
export async function apiGetBranchWebUrl(path: string, branchName: string, remote?: string) {
  return getBranchWebUrl(path, branchName, remote)
}
