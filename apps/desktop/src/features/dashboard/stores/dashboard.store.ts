import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createConfigStorage } from '../../../lib/appConfig/configStorage'

/** The dashboard's four repository sections, in display order. */
export const DASHBOARD_SECTION_IDS = ['open', 'favorites', 'recent', 'all'] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]

/**
 * The palette offered by "Change color", as theme token names rather than raw hex.
 *
 * Only the accent hue is stored; the header pulls its text and border from the same token, so every
 * choice keeps the contrast the theme already guarantees in both light and dark mode. Storing
 * `#ff0000` instead would let a user pick something unreadable in one of the two.
 */
export const SECTION_COLORS = [
  'primary',
  'emerald',
  'amber',
  'rose',
  'violet',
  'sky',
  'slate',
] as const

export type SectionColor = (typeof SECTION_COLORS)[number]

interface DashboardState {
  /**
   * Which sections are folded shut. Absent/false means expanded, so a fresh install shows
   * everything and new sections added later default to open.
   */
  collapsedSections: Partial<Record<DashboardSectionId, boolean>>
  /** Sections removed from the board entirely — restored from the header's hidden-sections menu. */
  hiddenSections: Partial<Record<DashboardSectionId, boolean>>
  /** Accent colour per section header. Absent means the default, uncoloured header. */
  sectionColors: Partial<Record<DashboardSectionId, SectionColor>>

  toggleSection: (id: DashboardSectionId) => void
  setSectionCollapsed: (id: DashboardSectionId, collapsed: boolean) => void
  /** Folds or unfolds every section at once — the header's Collapse/Expand all buttons. */
  setAllSectionsCollapsed: (collapsed: boolean) => void

  hideSection: (id: DashboardSectionId) => void
  showSection: (id: DashboardSectionId) => void
  showAllSections: () => void

  /** Passing `null` clears the colour back to the default header. */
  setSectionColor: (id: DashboardSectionId, color: SectionColor | null) => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      collapsedSections: {},
      hiddenSections: {},
      sectionColors: {},

      toggleSection: (id) =>
        set((state) => ({
          collapsedSections: { ...state.collapsedSections, [id]: !state.collapsedSections[id] },
        })),

      setSectionCollapsed: (id, collapsed) =>
        set((state) => ({
          collapsedSections: { ...state.collapsedSections, [id]: collapsed },
        })),

      setAllSectionsCollapsed: (collapsed) =>
        set({
          collapsedSections: Object.fromEntries(DASHBOARD_SECTION_IDS.map((id) => [id, collapsed])),
        }),

      hideSection: (id) =>
        set((state) => ({ hiddenSections: { ...state.hiddenSections, [id]: true } })),

      showSection: (id) =>
        set((state) => {
          const next = { ...state.hiddenSections }
          delete next[id]
          return { hiddenSections: next }
        }),

      showAllSections: () => set({ hiddenSections: {} }),

      setSectionColor: (id, color) =>
        set((state) => {
          const next = { ...state.sectionColors }
          if (color === null) delete next[id]
          else next[id] = color
          return { sectionColors: next }
        }),
    }),
    {
      name: 'git-manager-dashboard',
      // The `dashboard` section of ~/.git-manager/settings.json — see lib/appConfig/.
      storage: createConfigStorage('dashboard'),
      skipHydration: true,
    }
  )
)
