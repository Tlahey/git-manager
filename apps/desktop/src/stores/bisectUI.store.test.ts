import { describe, it, expect, beforeEach } from 'vitest'
import { useBisectUIStore } from './bisectUI.store'

function reset() {
  useBisectUIStore.setState({
    setupActive: false,
    activeSlot: 'bad',
    pendingBadOid: null,
    pendingGoodOid: null,
    autoStashed: false,
    stashDialogOpen: false,
  })
}

describe('useBisectUIStore', () => {
  beforeEach(reset)

  it('begins setup focused on the bad slot', () => {
    useBisectUIStore.getState().beginSetup()
    const s = useBisectUIStore.getState()
    expect(s.setupActive).toBe(true)
    expect(s.activeSlot).toBe('bad')
    expect(s.pendingBadOid).toBeNull()
    expect(s.pendingGoodOid).toBeNull()
  })

  it('picks the bad commit then auto-advances to the good slot', () => {
    useBisectUIStore.getState().beginSetup()
    useBisectUIStore.getState().pickCommit('bad1')
    const s = useBisectUIStore.getState()
    expect(s.pendingBadOid).toBe('bad1')
    expect(s.activeSlot).toBe('good')
  })

  it('fills both slots across two picks', () => {
    useBisectUIStore.getState().beginSetup()
    useBisectUIStore.getState().pickCommit('bad1')
    useBisectUIStore.getState().pickCommit('good1')
    const s = useBisectUIStore.getState()
    expect(s.pendingBadOid).toBe('bad1')
    expect(s.pendingGoodOid).toBe('good1')
  })

  it('re-picks a focused slot without stealing the other', () => {
    useBisectUIStore.getState().beginSetup()
    useBisectUIStore.getState().pickCommit('bad1')
    useBisectUIStore.getState().pickCommit('good1')
    // Re-focus the bad slot and pick a different commit.
    useBisectUIStore.getState().setActiveSlot('bad')
    useBisectUIStore.getState().pickCommit('bad2')
    const s = useBisectUIStore.getState()
    expect(s.pendingBadOid).toBe('bad2')
    expect(s.pendingGoodOid).toBe('good1')
    // Both filled, so focus stays on the slot just edited.
    expect(s.activeSlot).toBe('bad')
  })

  it('cancels setup back to the initial state', () => {
    useBisectUIStore.getState().beginSetup()
    useBisectUIStore.getState().pickCommit('bad1')
    useBisectUIStore.getState().cancelSetup()
    const s = useBisectUIStore.getState()
    expect(s.setupActive).toBe(false)
    expect(s.pendingBadOid).toBeNull()
    expect(s.pendingGoodOid).toBeNull()
  })

  it('toggles the auto-stash flag and opens the stash dialog', () => {
    const st = useBisectUIStore.getState()
    st.setAutoStashed(true)
    expect(useBisectUIStore.getState().autoStashed).toBe(true)

    st.openStashDialog()
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(true)
  })

  it('cancelSetup also closes the stash dialog', () => {
    useBisectUIStore.getState().openStashDialog()
    useBisectUIStore.getState().cancelSetup()
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(false)
  })
})
