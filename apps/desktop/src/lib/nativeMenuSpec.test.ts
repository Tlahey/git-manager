import { describe, it, expect } from 'vitest'
import {
  menuItem,
  menuSubmenu,
  menuSeparator,
  menuHeader,
  normalizeMenuSpec,
} from './nativeMenuSpec'

describe('normalizeMenuSpec', () => {
  it('drops falsy (conditional) entries', () => {
    const spec = normalizeMenuSpec([
      false,
      menuItem({ text: 'A' }),
      null,
      undefined,
      menuItem({ text: 'B' }),
    ])
    expect(spec).toEqual([
      { kind: 'item', text: 'A' },
      { kind: 'item', text: 'B' },
    ])
  })

  it('collapses consecutive separators left by absent conditional sections', () => {
    const spec = normalizeMenuSpec([
      menuItem({ text: 'A' }),
      menuSeparator(),
      false, // a whole section conditioned away
      menuSeparator(),
      menuItem({ text: 'B' }),
    ])
    expect(spec.map((n) => n.kind)).toEqual(['item', 'separator', 'item'])
  })

  it('trims leading and trailing separators', () => {
    const spec = normalizeMenuSpec([
      menuSeparator(),
      menuItem({ text: 'A' }),
      menuSeparator(),
      menuSeparator(),
    ])
    expect(spec.map((n) => n.kind)).toEqual(['item'])
  })

  it('normalizes submenu items recursively and keeps header nodes', () => {
    const spec = normalizeMenuSpec([
      menuHeader('3 selected'),
      menuSubmenu({ text: 'Reset', items: [false, menuItem({ text: 'Soft' }), menuSeparator()] }),
    ])
    expect(spec).toEqual([
      { kind: 'header', text: '3 selected' },
      { kind: 'submenu', text: 'Reset', items: [{ kind: 'item', text: 'Soft' }] },
    ])
  })

  it('prunes a submenu whose items all normalized away', () => {
    const spec = normalizeMenuSpec([
      menuItem({ text: 'A' }),
      menuSeparator(),
      menuSubmenu({ text: 'Empty', items: [false, menuSeparator()] }),
    ])
    expect(spec.map((n) => n.kind)).toEqual(['item'])
  })

  it('returns an empty spec for an all-falsy input', () => {
    expect(normalizeMenuSpec([false, null, menuSeparator()])).toEqual([])
  })

  it('preserves item metadata (icon, enabled, action identity)', () => {
    const action = () => {}
    const spec = normalizeMenuSpec([
      menuItem({ text: 'Create branch', icon: 'branch', enabled: false, action }),
    ])
    expect(spec[0]).toEqual({
      kind: 'item',
      text: 'Create branch',
      icon: 'branch',
      enabled: false,
      action,
    })
  })
})
