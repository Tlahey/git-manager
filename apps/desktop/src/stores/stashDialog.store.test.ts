import { describe, it, expect, beforeEach } from 'vitest'
import { useStashDialogStore } from './stashDialog.store'

describe('useStashDialogStore', () => {
  beforeEach(() => {
    useStashDialogStore.getState().closeDialog()
  })

  it('starts closed by default', () => {
    const state = useStashDialogStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.reason).toBeNull()
    expect(state.repoPath).toBeNull()
    expect(state.targetRef).toBeNull()
  })

  it('opens bisect dialog correctly', () => {
    useStashDialogStore.getState().openBisectDialog('/repo/path')
    const state = useStashDialogStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.reason).toBe('bisect')
    expect(state.repoPath).toBe('/repo/path')
    expect(state.targetRef).toBeNull()
  })

  it('opens checkout dialog correctly with options', () => {
    useStashDialogStore.getState().openCheckoutDialog('/repo/path', 'feature-branch', {
      fromRef: 'main',
      fromDetached: false,
    })
    const state = useStashDialogStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.reason).toBe('checkout')
    expect(state.repoPath).toBe('/repo/path')
    expect(state.targetRef).toBe('feature-branch')
    expect(state.checkoutOpts).toEqual({ fromRef: 'main', fromDetached: false })
  })

  it('keeps the checkout options null when none are provided', () => {
    useStashDialogStore.getState().openCheckoutDialog('/repo/path', 'feature-branch')
    expect(useStashDialogStore.getState().checkoutOpts).toBeNull()
  })

  it('resets state when closed', () => {
    useStashDialogStore.getState().openCheckoutDialog('/repo/path', 'feature-branch')
    useStashDialogStore.getState().closeDialog()

    const state = useStashDialogStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.reason).toBeNull()
    expect(state.repoPath).toBeNull()
    expect(state.targetRef).toBeNull()
    expect(state.checkoutOpts).toBeNull()
  })
})
