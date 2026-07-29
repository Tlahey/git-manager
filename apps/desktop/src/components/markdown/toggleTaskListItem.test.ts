import { describe, it, expect } from 'vitest'
import { toggleTaskListItem } from './toggleTaskListItem'

describe('toggleTaskListItem', () => {
  it('ticks the item on the given line and leaves the rest of the document alone', () => {
    const source = '## Plan\n\n- [ ] first\n- [ ] second\n'

    expect(toggleTaskListItem(source, 4, true)).toBe('## Plan\n\n- [ ] first\n- [x] second\n')
  })

  it('unticks a checked item', () => {
    expect(toggleTaskListItem('- [x] done', 1, false)).toBe('- [ ] done')
  })

  it('reads an uppercase X as checked, so unticking it still writes', () => {
    expect(toggleTaskListItem('- [X] done', 1, false)).toBe('- [ ] done')
    expect(toggleTaskListItem('- [X] done', 1, true)).toBeNull()
  })

  it('handles nested items, other bullets and ordered markers', () => {
    const source = '* [ ] star\n  - [ ] nested\n1. [ ] ordered\n2) [ ] paren'

    expect(toggleTaskListItem(source, 1, true)).toContain('* [x] star')
    expect(toggleTaskListItem(source, 2, true)).toContain('  - [x] nested')
    expect(toggleTaskListItem(source, 3, true)).toContain('1. [x] ordered')
    expect(toggleTaskListItem(source, 4, true)).toContain('2) [x] paren')
  })

  it('writes nothing when the item already carries the requested state', () => {
    expect(toggleTaskListItem('- [x] done', 1, true)).toBeNull()
    expect(toggleTaskListItem('- [ ] todo', 1, false)).toBeNull()
  })

  it('writes nothing when the line no longer holds a task marker', () => {
    // What a body edited on GitHub since this was rendered looks like: rewriting line 1 blindly
    // would replace prose with a checkbox.
    expect(toggleTaskListItem('just a sentence', 1, true)).toBeNull()
    expect(toggleTaskListItem('- a plain bullet', 1, true)).toBeNull()
    expect(toggleTaskListItem('- [ ] todo', 9, true)).toBeNull()
  })

  it('keeps the rest of the line, including trailing carriage returns', () => {
    expect(toggleTaskListItem('- [ ] todo **bold** [link](x)', 1, true)).toBe(
      '- [x] todo **bold** [link](x)'
    )
    expect(toggleTaskListItem('- [ ] todo\r\nnext', 1, true)).toBe('- [x] todo\r\nnext')
  })
})
