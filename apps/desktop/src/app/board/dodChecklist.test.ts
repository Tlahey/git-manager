import { describe, it, expect } from 'vitest'
import { addItem, parseDodItems, removeItem, setItemDone, setItemText } from './dodChecklist'

describe('parseDodItems', () => {
  it('finds nothing in an empty checklist', () => {
    expect(parseDodItems('')).toEqual([])
  })

  it('reads ticked and unticked items', () => {
    expect(parseDodItems('- [x] One\n- [ ] Two')).toEqual([
      { index: 0, text: 'One', done: true },
      { index: 1, text: 'Two', done: false },
    ])
  })

  it('accepts every GFM bullet and a capital X, like GitHub does', () => {
    const items = parseDodItems('* [X] One\n+ [ ] Two\n  - [x] Nested')
    expect(items.map((i) => i.text)).toEqual(['One', 'Two', 'Nested'])
    expect(items.map((i) => i.done)).toEqual([true, false, true])
  })

  it('ignores prose and plain bullets, but keeps the real items’ line numbers', () => {
    const items = parseDodItems('Some notes\n\n- A plain bullet\n- [ ] A real item')
    expect(items).toEqual([{ index: 3, text: 'A real item', done: false }])
  })
})

describe('setItemDone', () => {
  it('ticks and unticks an item', () => {
    expect(setItemDone('- [ ] One\n- [ ] Two', 0, true)).toBe('- [x] One\n- [ ] Two')
    expect(setItemDone('- [x] One', 0, false)).toBe('- [ ] One')
  })

  it('keeps the original bullet and indentation', () => {
    expect(setItemDone('  * [ ] Nested', 0, true)).toBe('  * [x] Nested')
  })

  it('leaves the document alone when the line is not a checkbox', () => {
    const doc = 'Just prose'
    expect(setItemDone(doc, 0, true)).toBe(doc)
  })
})

describe('setItemText', () => {
  it('rewrites the label without touching the tick', () => {
    expect(setItemText('- [x] Old', 0, 'New')).toBe('- [x] New')
  })
})

describe('removeItem', () => {
  it('drops the line', () => {
    expect(removeItem('- [ ] One\n- [ ] Two', 0)).toBe('- [ ] Two')
  })

  it('refuses to remove a line that is not an item', () => {
    const doc = '# Heading\n- [ ] One'
    expect(removeItem(doc, 0)).toBe(doc)
  })
})

describe('addItem', () => {
  it('creates the first item', () => {
    expect(addItem('', 'One')).toBe('- [ ] One')
  })

  it('appends after the existing items', () => {
    expect(addItem('- [ ] One', 'Two')).toBe('- [ ] One\n- [ ] Two')
  })

  it('adds nothing for a blank label', () => {
    expect(addItem('- [ ] One', '   ')).toBe('- [ ] One')
  })

  /** The reason the editor works on lines rather than replacing the document: a DOD may hold prose,
   * and ticking a box must not be a way to lose it. */
  it('slots in after the last checkbox, leaving a closing note last', () => {
    expect(addItem('- [ ] One\n\nAsk Ada before shipping.', 'Two')).toBe(
      '- [ ] One\n- [ ] Two\n\nAsk Ada before shipping.'
    )
  })

  it('keeps a leading heading above the items', () => {
    expect(addItem('## Checklist\n- [ ] One', 'Two')).toBe('## Checklist\n- [ ] One\n- [ ] Two')
  })
})

describe('round trip', () => {
  it('preserves everything that is not a checkbox through a full edit cycle', () => {
    const original = '## Checklist\n\n- [ ] One\n- [ ] Two\n\nNotes: ask Ada.'
    let doc = setItemDone(original, 2, true)
    doc = setItemText(doc, 3, 'Two (revised)')
    doc = addItem(doc, 'Three')

    expect(doc).toBe(
      '## Checklist\n\n- [x] One\n- [ ] Two (revised)\n- [ ] Three\n\nNotes: ask Ada.'
    )
  })
})
