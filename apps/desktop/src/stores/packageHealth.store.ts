import { create } from 'zustand'
import type { HealthCheckId } from '@git-manager/git-types'

/**
 * The center pane's subject: the workspace overview, one check's findings, or the
 * updates page. Updates is its own selection rather than a section of the overview
 * because it is the only page that reaches the network and can change the repo.
 */
export type HealthSelection =
  | { kind: 'overview' }
  | { kind: 'check'; id: HealthCheckId }
  | { kind: 'updates' }

/**
 * Drives the in-layout package health workspace, which reuses the git-graph's
 * two-pane shell the same way the patch workspace does: the right panel lists the
 * checks, the center renders the selected one's report. Only the cross-slot state
 * lives here — `open` (is the tool showing) and `selection` (what the center draws).
 */
interface PackageHealthState {
  open: boolean
  selection: HealthSelection
  openTool: () => void
  close: () => void
  select: (selection: HealthSelection) => void
}

export const usePackageHealthStore = create<PackageHealthState>((set) => ({
  open: false,
  selection: { kind: 'overview' },
  openTool: () => set({ open: true, selection: { kind: 'overview' } }),
  close: () => set({ open: false, selection: { kind: 'overview' } }),
  select: (selection) => set({ selection }),
}))
