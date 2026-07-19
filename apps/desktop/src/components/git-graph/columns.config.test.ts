import { describe, it, expect } from 'vitest'
import { COLUMN_ORDER, COLUMN_DEFS } from './columns.config'

describe('COLUMN_ORDER / COLUMN_DEFS', () => {
  it('COLUMN_ORDER lists exactly the same keys as COLUMN_DEFS, with no duplicates', () => {
    expect(new Set(COLUMN_ORDER).size).toBe(COLUMN_ORDER.length)
    expect([...COLUMN_ORDER].sort()).toEqual(Object.keys(COLUMN_DEFS).sort())
  })

  it('each def is keyed under its own .key', () => {
    for (const [key, def] of Object.entries(COLUMN_DEFS)) {
      expect(def.key).toBe(key)
    }
  })

  it('defaultWidth is never smaller than minWidth', () => {
    for (const def of Object.values(COLUMN_DEFS)) {
      expect(def.defaultWidth).toBeGreaterThanOrEqual(def.minWidth)
    }
  })

  it('every labelKey lives under the gitTree.columns i18n namespace', () => {
    for (const def of Object.values(COLUMN_DEFS)) {
      expect(def.labelKey).toMatch(/^gitTree\.columns\./)
    }
  })

  it('exactly one column is flex (message), and it has no fixed default width contract violated', () => {
    const flexColumns = Object.values(COLUMN_DEFS).filter((d) => d.flex)
    expect(flexColumns.map((d) => d.key)).toEqual(['message'])
  })

  it('refs, graph and message are visible by default; author, date and sha are not', () => {
    expect(COLUMN_DEFS.refs.defaultVisible).toBe(true)
    expect(COLUMN_DEFS.graph.defaultVisible).toBe(true)
    expect(COLUMN_DEFS.message.defaultVisible).toBe(true)
    expect(COLUMN_DEFS.author.defaultVisible).toBe(false)
    expect(COLUMN_DEFS.date.defaultVisible).toBe(false)
    expect(COLUMN_DEFS.sha.defaultVisible).toBe(false)
  })
})
