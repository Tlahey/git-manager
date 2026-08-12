import { create } from 'zustand'
import type { ErrorReportDraft } from '../lib/buildReport'

/**
 * Which failure the report dialog is currently showing, and which ones this session has already
 * filed.
 *
 * **A store rather than local state** because the dialog is opened from places that share no
 * ancestor: a row in the Activity Logs takeover, and — eventually — an error toast. The crash
 * screen is the one caller that does *not* go through here, and cannot: the boundary renders in
 * place of a tree that just threw, so it owns its own dialog instance.
 *
 * **Not persisted.** `reported` is a session-scoped guard against a crash loop filing the same
 * issue forty times, not a history: the durable record of a report is the issue itself, on GitHub,
 * where the user can find it. Persisting it would also mean either a tenth config section or a
 * `localStorage` key that survives a reinstall and silently suppresses a report the user now wants
 * to file.
 */
interface ErrorReportState {
  /** The failure being reported, or `null` when the dialog is closed. */
  draft: ErrorReportDraft | null
  /** Fingerprint → the issue URL it produced, for failures reported since launch. */
  reported: Record<string, string>
  openReport: (draft: ErrorReportDraft) => void
  closeReport: () => void
  markReported: (fingerprint: string, issueUrl: string) => void
}

export const useErrorReportStore = create<ErrorReportState>((set) => ({
  draft: null,
  reported: {},

  openReport: (draft) => set({ draft }),
  closeReport: () => set({ draft: null }),
  markReported: (fingerprint, issueUrl) =>
    set((state) => ({ reported: { ...state.reported, [fingerprint]: issueUrl } })),
}))
