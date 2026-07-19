import { describe, it, expect, beforeEach } from 'vitest'
import { useGitGraphColumnsStore } from './gitGraphColumns.store'
import { COLUMN_DEFS, COLUMN_ORDER } from '../components/git-graph/columns.config'

function defaultColumns() {
  return COLUMN_ORDER.reduce(
    (acc, key) => {
      const def = COLUMN_DEFS[key]
      acc[key] = { visible: def.defaultVisible, width: def.defaultWidth }
      return acc
    },
    {} as Record<string, { visible: boolean; width: number }>
  )
}

beforeEach(() => {
  useGitGraphColumnsStore.setState({ columns: defaultColumns() })
  localStorage.clear()
})

describe('useGitGraphColumnsStore', () => {
  it('starts with every column at its declared defaults', () => {
    expect(useGitGraphColumnsStore.getState().columns).toEqual(defaultColumns())
  })

  it('setVisibility toggles a single column without touching the others', () => {
    useGitGraphColumnsStore.getState().setVisibility('author', true)
    const columns = useGitGraphColumnsStore.getState().columns
    expect(columns.author.visible).toBe(true)
    expect(columns.refs.visible).toBe(COLUMN_DEFS.refs.defaultVisible)
  })

  it('setWidth updates a column width, rounding to the nearest integer', () => {
    useGitGraphColumnsStore.getState().setWidth('date', 123.6)
    expect(useGitGraphColumnsStore.getState().columns.date.width).toBe(124)
  })

  it('setWidth clamps to the column-specific minWidth', () => {
    useGitGraphColumnsStore.getState().setWidth('sha', 10)
    expect(useGitGraphColumnsStore.getState().columns.sha.width).toBe(COLUMN_DEFS.sha.minWidth)
  })

  it('reset() restores every column to its defaults after changes', () => {
    useGitGraphColumnsStore.getState().setVisibility('author', true)
    useGitGraphColumnsStore.getState().setWidth('message', 999)
    useGitGraphColumnsStore.getState().reset()
    expect(useGitGraphColumnsStore.getState().columns).toEqual(defaultColumns())
  })
})

describe('useGitGraphColumnsStore — persisted-state merge (forward compatibility)', () => {
  const merge = (
    useGitGraphColumnsStore.persist.getOptions() as unknown as {
      merge: (
        persisted: unknown,
        current: ReturnType<typeof useGitGraphColumnsStore.getState>
      ) => ReturnType<typeof useGitGraphColumnsStore.getState>
    }
  ).merge

  it("keeps a saved column's visibility/width when present in persisted state", () => {
    const persisted = { columns: { author: { visible: true, width: 250 } } }
    const merged = merge(persisted, useGitGraphColumnsStore.getState())
    expect(merged.columns.author).toEqual({ visible: true, width: 250 })
  })

  it('falls back to defaults for a column missing from persisted state (e.g. newly added)', () => {
    const persisted = { columns: { author: { visible: true, width: 250 } } }
    const merged = merge(persisted, useGitGraphColumnsStore.getState())
    expect(merged.columns.sha).toEqual({
      visible: COLUMN_DEFS.sha.defaultVisible,
      width: COLUMN_DEFS.sha.defaultWidth,
    })
  })

  it('re-clamps a persisted width that is now below the current minWidth', () => {
    const persisted = { columns: { sha: { visible: true, width: 10 } } }
    const merged = merge(persisted, useGitGraphColumnsStore.getState())
    expect(merged.columns.sha.width).toBe(COLUMN_DEFS.sha.minWidth)
  })

  it('falls back to full defaults when there is no persisted state at all', () => {
    const merged = merge(undefined, useGitGraphColumnsStore.getState())
    expect(merged.columns).toEqual(defaultColumns())
  })
})
