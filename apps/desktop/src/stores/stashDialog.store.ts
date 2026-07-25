import { create } from 'zustand'
import type { CheckoutOpts } from '../api/git.api'

/** Why the shared "stash your changes to proceed" dialog is open — one dialog, two flows. */
export type StashDialogReason = 'bisect' | 'checkout'

export interface StashDialogState {
  isOpen: boolean
  reason: StashDialogReason | null
  repoPath: string | null
  /** Branch/commit to switch to once stashed — `checkout` reason only. */
  targetRef: string | null
  /** Undo metadata for the deferred checkout — `checkout` reason only. */
  checkoutOpts: CheckoutOpts | null

  openBisectDialog: (repoPath: string) => void
  openCheckoutDialog: (repoPath: string, targetRef: string, opts?: CheckoutOpts) => void
  closeDialog: () => void
}

const CLOSED = {
  isOpen: false,
  reason: null,
  repoPath: null,
  targetRef: null,
  checkoutOpts: null,
} as const

export const useStashDialogStore = create<StashDialogState>((set) => ({
  ...CLOSED,

  openBisectDialog: (repoPath) =>
    set({ isOpen: true, reason: 'bisect', repoPath, targetRef: null, checkoutOpts: null }),

  openCheckoutDialog: (repoPath, targetRef, opts) =>
    set({
      isOpen: true,
      reason: 'checkout',
      repoPath,
      targetRef,
      checkoutOpts: opts ?? null,
    }),

  closeDialog: () => set({ ...CLOSED }),
}))
