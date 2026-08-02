import {
  stashPush,
  stashPop,
  stashList,
  stashApply,
  stashDrop,
  editStashMessage,
  pinObject,
  snapshotWorktreeAlways,
} from '../../lib/tauri'
import { generateId, pushAction, clearRedo } from './gitApiShared'

export async function apiStashPush(path: string, message?: string, includeUntracked = false) {
  const result = await stashPush(path, message, includeUntracked)
  pushAction(path, {
    id: generateId(),
    timestamp: Date.now(),
    label: { key: 'undoRedo.stashPush', params: { message: message || 'WIP' } },
    pinnedRefs: [],
    type: 'stashPush',
    message,
    includeUntracked,
  })
  return result
}

export async function apiStashPop(path: string, index?: number) {
  const idx = index ?? 0
  const stashes = await stashList(path)
  const target = stashes.find((s) => s.index === idx)
  const id = generateId()
  const preSnapshot = await snapshotWorktreeAlways(path, id)

  if (target) {
    await pinObject(path, `${id}-stash`, target.commitOid).catch(() => {})
  }

  const result = await stashPop(path, index)

  if (target) {
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.stashPop', params: { message: target.message } },
      pinnedRefs: [`${id}-stash`, preSnapshot.indexRefName, preSnapshot.workdirRefName],
      type: 'stashPop',
      message: target.message,
      commitOid: target.commitOid,
      snapshot: preSnapshot,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiStashApply(path: string, index?: number) {
  const idx = index ?? 0
  const id = generateId()
  const preSnapshot = await snapshotWorktreeAlways(path, id)

  const result = await stashApply(path, index)

  pushAction(path, {
    id,
    timestamp: Date.now(),
    label: { key: 'undoRedo.stashApply', params: { index: idx } },
    pinnedRefs: [preSnapshot.indexRefName, preSnapshot.workdirRefName],
    type: 'stashApply',
    index: idx,
    snapshot: preSnapshot,
  })

  return result
}

export async function apiStashDrop(path: string, index: number) {
  const stashes = await stashList(path)
  const target = stashes.find((s) => s.index === index)
  const id = generateId()

  if (target) {
    await pinObject(path, id, target.commitOid).catch(() => {})
  }

  const result = await stashDrop(path, index)

  if (target) {
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.stashDrop', params: { message: target.message } },
      pinnedRefs: [id],
      type: 'stashDrop',
      message: target.message,
      commitOid: target.commitOid,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiUpdateStashMessage(path: string, index: number, message: string) {
  const result = await editStashMessage(path, index, message)
  return result
}

export async function apiStashList(path: string) {
  return stashList(path)
}
