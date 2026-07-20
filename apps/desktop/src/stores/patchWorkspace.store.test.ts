import { describe, it, expect, beforeEach } from 'vitest'
import { usePatchWorkspaceStore } from './patchWorkspace.store'

const file = { path: 'a.ts', original: 'a', modified: 'b' }

beforeEach(() => usePatchWorkspaceStore.getState().close())

describe('patchWorkspace store', () => {
  it('open sets the mode and clears any active file', () => {
    usePatchWorkspaceStore.getState().setActiveFile(file)
    usePatchWorkspaceStore.getState().open('apply')
    expect(usePatchWorkspaceStore.getState().mode).toBe('apply')
    expect(usePatchWorkspaceStore.getState().activeFile).toBeNull()
  })

  it('setActiveFile updates the center file', () => {
    usePatchWorkspaceStore.getState().open('create')
    usePatchWorkspaceStore.getState().setActiveFile(file)
    expect(usePatchWorkspaceStore.getState().activeFile).toEqual(file)
  })

  it('close resets mode and active file', () => {
    usePatchWorkspaceStore.getState().open('dependency')
    usePatchWorkspaceStore.getState().setActiveFile(file)
    usePatchWorkspaceStore.getState().close()
    expect(usePatchWorkspaceStore.getState().mode).toBeNull()
    expect(usePatchWorkspaceStore.getState().activeFile).toBeNull()
  })
})
