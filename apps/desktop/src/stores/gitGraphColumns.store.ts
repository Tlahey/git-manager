import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { COLUMN_DEFS, COLUMN_ORDER, type ColumnKey } from '../components/git-graph/columns'

interface ColumnState {
  visible: boolean
  width: number
}

interface GitGraphColumnsState {
  columns: Record<ColumnKey, ColumnState>
  setVisibility: (key: ColumnKey, visible: boolean) => void
  setWidth: (key: ColumnKey, width: number) => void
  reset: () => void
}

function buildDefaults(): Record<ColumnKey, ColumnState> {
  return COLUMN_ORDER.reduce((acc, key) => {
    const def = COLUMN_DEFS[key]
    acc[key] = { visible: def.defaultVisible, width: def.defaultWidth }
    return acc
  }, {} as Record<ColumnKey, ColumnState>)
}

export const useGitGraphColumnsStore = create<GitGraphColumnsState>()(
  persist(
    (set) => ({
      columns: buildDefaults(),

      setVisibility: (key, visible) =>
        set((state) => ({
          columns: { ...state.columns, [key]: { ...state.columns[key], visible } },
        })),

      setWidth: (key, width) =>
        set((state) => {
          const min = COLUMN_DEFS[key].minWidth
          return {
            columns: {
              ...state.columns,
              [key]: { ...state.columns[key], width: Math.max(min, Math.round(width)) },
            },
          }
        }),

      reset: () => set({ columns: buildDefaults() }),
    }),
    {
      name: 'git-manager-git-graph-columns',
      // Fusionne l'état persisté avec les valeurs par défaut pour garantir que
      // toute nouvelle colonne ajoutée plus tard reçoit ses défauts.
      merge: (persisted, current) => {
        const defaults = buildDefaults()
        const saved =
          (persisted as Partial<GitGraphColumnsState> | undefined)?.columns ??
          ({} as Partial<Record<ColumnKey, ColumnState>>)
        const columns = COLUMN_ORDER.reduce((acc, key) => {
          acc[key] = { ...defaults[key], ...saved[key] }
          return acc
        }, {} as Record<ColumnKey, ColumnState>)
        return { ...current, columns }
      },
    }
  )
)
