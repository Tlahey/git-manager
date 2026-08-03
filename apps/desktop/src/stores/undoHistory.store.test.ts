import { describe, it, expect, vi, beforeEach } from 'vitest'

const { executeUndo, executeRedo, collectActionOids } = vi.hoisted(() => ({
  executeUndo: vi.fn(),
  executeRedo: vi.fn(),
  collectActionOids: vi.fn((action: { id: string }) => [`${action.id}-oid`]),
}))
vi.mock('../lib/undoActions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/undoActions')>()
  return { ...actual, executeUndo, executeRedo, collectActionOids }
})

const { apiUnpinObject, apiObjectsExist } = vi.hoisted(() => ({
  apiUnpinObject: vi.fn().mockResolvedValue(undefined),
  apiObjectsExist: vi.fn(),
}))
vi.mock('../api/undoSupport.api', () => ({ apiUnpinObject, apiObjectsExist }))

import { useUndoHistoryStore, type UndoAction } from './undoHistory.store'

const REPO = '/repo/a'

function action(id: string, pinnedRefs: string[] = [], correlationId?: string): UndoAction {
  return {
    id,
    label: { key: `label.${id}` },
    timestamp: 0,
    pinnedRefs,
    ...(correlationId ? { correlationId } : {}),
    type: 'commit',
    previousOid: 'p',
    newOid: 'n',
  } as UndoAction
}

beforeEach(() => {
  useUndoHistoryStore.setState({ byRepo: {} })
  executeUndo.mockReset()
  executeRedo.mockReset()
  collectActionOids.mockReset().mockImplementation((a: { id: string }) => [`${a.id}-oid`])
  apiUnpinObject.mockReset().mockResolvedValue(undefined)
  apiObjectsExist.mockReset()
  localStorage.clear()
})

describe('useUndoHistoryStore — push/canUndo/canRedo/peek', () => {
  it('push adds an action and moves the pointer to the end', () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    const history = useUndoHistoryStore.getState().byRepo[REPO]
    expect(history.stack).toHaveLength(1)
    expect(history.pointer).toBe(1)
  })

  it('canUndo/canRedo reflect the pointer position', () => {
    expect(useUndoHistoryStore.getState().canUndo(REPO)).toBe(false)
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    expect(useUndoHistoryStore.getState().canUndo(REPO)).toBe(true)
    expect(useUndoHistoryStore.getState().canRedo(REPO)).toBe(false)
  })

  it('peekUndoLabel/peekRedoLabel report the labels at the pointer boundary', () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    expect(useUndoHistoryStore.getState().peekUndoLabel(REPO)).toEqual({ key: 'label.a1' })
    expect(useUndoHistoryStore.getState().peekRedoLabel(REPO)).toBeNull()
  })

  it('pushing past MAX_HISTORY (50) evicts the oldest entries and unpins them', () => {
    for (let i = 0; i < 52; i++) {
      useUndoHistoryStore.getState().push(REPO, action(`a${i}`, [`ref/${i}`]))
    }
    const history = useUndoHistoryStore.getState().byRepo[REPO]
    expect(history.stack).toHaveLength(50)
    expect(history.stack[0].id).toBe('a2') // a0/a1 evicted
    expect(apiUnpinObject).toHaveBeenCalledWith(REPO, 'ref/0')
    expect(apiUnpinObject).toHaveBeenCalledWith(REPO, 'ref/1')
  })

  it('pushing after undoing drops the redo tail and unpins it', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    useUndoHistoryStore.getState().push(REPO, action('a2', ['ref/a2']))
    await useUndoHistoryStore.getState().undo(REPO) // pointer back to 1, a2 now the "redo tail"

    useUndoHistoryStore.getState().push(REPO, action('a3'))

    const history = useUndoHistoryStore.getState().byRepo[REPO]
    expect(history.stack.map((a) => a.id)).toEqual(['a1', 'a3'])
    expect(apiUnpinObject).toHaveBeenCalledWith(REPO, 'ref/a2')
  })
})

describe('useUndoHistoryStore — corrupted-state resilience', () => {
  it('peekUndoLabel returns null (no crash) on a null stack entry', () => {
    useUndoHistoryStore.setState({
      byRepo: { [REPO]: { stack: [null as unknown as UndoAction], pointer: 1 } },
    })
    expect(() => useUndoHistoryStore.getState().peekUndoLabel(REPO)).not.toThrow()
    expect(useUndoHistoryStore.getState().peekUndoLabel(REPO)).toBeNull()
  })

  it('peekUndoLabel returns null when the pointer is out of the stack bounds', () => {
    useUndoHistoryStore.setState({ byRepo: { [REPO]: { stack: [action('a')], pointer: 5 } } })
    expect(useUndoHistoryStore.getState().peekUndoLabel(REPO)).toBeNull()
  })

  it('undo/redo are no-ops on a null entry', async () => {
    useUndoHistoryStore.setState({
      byRepo: { [REPO]: { stack: [null as unknown as UndoAction], pointer: 1 } },
    })
    await useUndoHistoryStore.getState().undo(REPO)
    expect(executeUndo).not.toHaveBeenCalled()
  })

  it('sanitizes a corrupted persisted stack on rehydration (drops nulls, realigns pointer)', async () => {
    localStorage.setItem(
      'git-manager-undo-history',
      JSON.stringify({
        state: { byRepo: { [REPO]: { stack: [null, action('a'), null], pointer: 3 } } },
        version: 0,
      })
    )
    await useUndoHistoryStore.persist.rehydrate()
    const h = useUndoHistoryStore.getState().byRepo[REPO]
    expect(h.stack).toHaveLength(1)
    expect(h.stack[0].id).toBe('a')
    expect(h.pointer).toBe(1)
    expect(useUndoHistoryStore.getState().peekUndoLabel(REPO)).toEqual({ key: 'label.a' })
  })
})

describe('useUndoHistoryStore — undo/redo', () => {
  it('undo executes the top action and decrements the pointer', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    await useUndoHistoryStore.getState().undo(REPO)
    expect(executeUndo).toHaveBeenCalledWith(REPO, expect.objectContaining({ id: 'a1' }))
    expect(useUndoHistoryStore.getState().byRepo[REPO].pointer).toBe(0)
  })

  it('undo is a no-op when the pointer is already at 0', async () => {
    await useUndoHistoryStore.getState().undo(REPO)
    expect(executeUndo).not.toHaveBeenCalled()
  })

  it('redo executes the next action and increments the pointer', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    await useUndoHistoryStore.getState().undo(REPO)
    await useUndoHistoryStore.getState().redo(REPO)
    expect(executeRedo).toHaveBeenCalledWith(REPO, expect.objectContaining({ id: 'a1' }))
    expect(useUndoHistoryStore.getState().byRepo[REPO].pointer).toBe(1)
  })

  it('redo is a no-op when the pointer is already at the top', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    await useUndoHistoryStore.getState().redo(REPO)
    expect(executeRedo).not.toHaveBeenCalled()
  })

  it('clearRedo drops everything past the pointer and unpins it', () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    useUndoHistoryStore.getState().push(REPO, action('a2', ['ref/a2']))
    useUndoHistoryStore.setState((state) => ({
      byRepo: { ...state.byRepo, [REPO]: { ...state.byRepo[REPO], pointer: 1 } },
    }))
    useUndoHistoryStore.getState().clearRedo(REPO)
    const history = useUndoHistoryStore.getState().byRepo[REPO]
    expect(history.stack).toHaveLength(1)
    expect(apiUnpinObject).toHaveBeenCalledWith(REPO, 'ref/a2')
  })

  it('clearRedo is a no-op when the pointer is already at the top', () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    useUndoHistoryStore.getState().clearRedo(REPO)
    expect(apiUnpinObject).not.toHaveBeenCalled()
  })
})

describe('useUndoHistoryStore — validateAndPrune', () => {
  it('drops actions whose oids no longer exist in the repo', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    useUndoHistoryStore.getState().push(REPO, action('a2'))
    apiObjectsExist.mockResolvedValue([true, false]) // a1-oid exists, a2-oid doesn't

    await useUndoHistoryStore.getState().validateAndPrune(REPO)

    const history = useUndoHistoryStore.getState().byRepo[REPO]
    expect(history.stack.map((a) => a.id)).toEqual(['a1'])
  })

  it('adjusts the pointer to only count still-kept actions before it', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    useUndoHistoryStore.getState().push(REPO, action('a2'))
    useUndoHistoryStore.getState().push(REPO, action('a3'))
    apiObjectsExist.mockResolvedValue([false, true, true]) // a1 dropped, a2/a3 kept

    await useUndoHistoryStore.getState().validateAndPrune(REPO)

    const history = useUndoHistoryStore.getState().byRepo[REPO]
    expect(history.stack.map((a) => a.id)).toEqual(['a2', 'a3'])
    expect(history.pointer).toBe(2) // was 3, one of the two kept-before-pointer entries dropped
  })

  it('does nothing when every oid still exists', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    apiObjectsExist.mockResolvedValue([true])
    await useUndoHistoryStore.getState().validateAndPrune(REPO)
    expect(useUndoHistoryStore.getState().byRepo[REPO].stack).toHaveLength(1)
  })

  it('leaves the history untouched when the existence check throws (transient IPC error)', async () => {
    useUndoHistoryStore.getState().push(REPO, action('a1'))
    apiObjectsExist.mockRejectedValue(new Error('repo not found'))
    await expect(useUndoHistoryStore.getState().validateAndPrune(REPO)).resolves.toBeUndefined()
    expect(useUndoHistoryStore.getState().byRepo[REPO].stack).toHaveLength(1)
  })

  it('is a no-op for a repo with no history', async () => {
    await expect(useUndoHistoryStore.getState().validateAndPrune(REPO)).resolves.toBeUndefined()
    expect(apiObjectsExist).not.toHaveBeenCalled()
  })
})

// One user gesture routinely performs several git operations — "create a branch here" creates the
// ref and checks it out — and `pushAction` stamps each with the gesture's correlation id. Undo has
// to take the whole gesture back at once: undoing half of it left the repository in a state where
// the other half could not be undone at all (git refuses to delete a branch it has just made HEAD).
describe('useUndoHistoryStore — correlated gestures undo as one', () => {
  const store = () => useUndoHistoryStore.getState()

  function pushGesture() {
    store().push(REPO, action('create', [], 'corr-1'))
    store().push(REPO, action('checkout', [], 'corr-1'))
  }

  it('undoes every entry of the gesture, newest operation first', async () => {
    pushGesture()
    await store().undo(REPO)

    expect(executeUndo).toHaveBeenCalledTimes(2)
    expect(executeUndo.mock.calls[0]![1]).toMatchObject({ id: 'checkout' })
    expect(executeUndo.mock.calls[1]![1]).toMatchObject({ id: 'create' })
    expect(store().canUndo(REPO)).toBe(false)
  })

  it('redoes them in the order they originally happened', async () => {
    pushGesture()
    await store().undo(REPO)
    await store().redo(REPO)

    expect(executeRedo.mock.calls.map((c) => (c[1] as { id: string }).id)).toEqual([
      'create',
      'checkout',
    ])
    expect(store().canRedo(REPO)).toBe(false)
  })

  it('names the gesture, not its last step', () => {
    pushGesture()
    expect(store().peekUndoLabel(REPO)).toEqual({ key: 'label.create' })
  })

  it('leaves an uncorrelated action as a group of its own', async () => {
    store().push(REPO, action('lonely'))
    store().push(REPO, action('create', [], 'corr-1'))
    store().push(REPO, action('checkout', [], 'corr-1'))

    await store().undo(REPO)
    expect(executeUndo).toHaveBeenCalledTimes(2)

    executeUndo.mockClear()
    await store().undo(REPO)
    expect(executeUndo).toHaveBeenCalledTimes(1)
    expect(executeUndo.mock.calls[0]![1]).toMatchObject({ id: 'lonely' })
  })

  it('does not merge two gestures that happen to be adjacent', async () => {
    store().push(REPO, action('a1', [], 'corr-1'))
    store().push(REPO, action('b1', [], 'corr-2'))

    await store().undo(REPO)
    expect(executeUndo).toHaveBeenCalledTimes(1)
    expect(executeUndo.mock.calls[0]![1]).toMatchObject({ id: 'b1' })
  })
})

// A gesture can fail halfway: git takes back the checkout, then refuses the branch deletion. The
// pointer has to record what actually came back, or the entries already reverted stay marked as
// applied and the next ⌘Z reverts them a second time.
describe('useUndoHistoryStore — a gesture that fails halfway', () => {
  const store = () => useUndoHistoryStore.getState()

  function pushGesture() {
    store().push(REPO, action('create', [], 'corr-1'))
    store().push(REPO, action('checkout', [], 'corr-1'))
  }

  it('advances the pointer past the steps that succeeded and rethrows', async () => {
    pushGesture()
    // Newest first: the checkout comes back, the branch deletion is refused.
    executeUndo.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('is checked out'))

    await expect(store().undo(REPO)).rejects.toThrow()

    expect(useUndoHistoryStore.getState().byRepo[REPO]!.pointer).toBe(1)
    // The failed entry is still there to retry — the reverted one is not replayed.
    expect(store().canUndo(REPO)).toBe(true)
    executeUndo.mockClear().mockResolvedValue(undefined)
    await store().undo(REPO)
    expect(executeUndo.mock.calls.map((c) => (c[1] as { id: string }).id)).toEqual(['create'])
  })

  it('leaves the pointer alone when the very first step fails', async () => {
    pushGesture()
    executeUndo.mockRejectedValue(new Error('nope'))

    await expect(store().undo(REPO)).rejects.toThrow()
    expect(useUndoHistoryStore.getState().byRepo[REPO]!.pointer).toBe(2)
  })

  it('applies the same rule to redo', async () => {
    pushGesture()
    await store().undo(REPO)
    executeRedo.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('nope'))

    await expect(store().redo(REPO)).rejects.toThrow()
    expect(useUndoHistoryStore.getState().byRepo[REPO]!.pointer).toBe(1)
  })
})
