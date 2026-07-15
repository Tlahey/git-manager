import { describe, it, expect } from 'vitest'
import { toggleMarkdownCheckbox } from './toggleMarkdownCheckbox'

describe('toggleMarkdownCheckbox', () => {
  it('checks an unchecked box', () => {
    expect(toggleMarkdownCheckbox('- [ ] todo', 0)).toBe('- [x] todo')
  })

  it('unchecks a checked box', () => {
    expect(toggleMarkdownCheckbox('- [x] done', 0)).toBe('- [ ] done')
  })

  it('treats uppercase "[X]" as checked and unchecks it', () => {
    expect(toggleMarkdownCheckbox('- [X] done', 0)).toBe('- [ ] done')
  })

  it('supports the "*" list marker', () => {
    expect(toggleMarkdownCheckbox('* [ ] todo', 0)).toBe('* [x] todo')
  })

  it('flips only the targeted index, leaving other lines untouched', () => {
    const content = '- [ ] first\n- [ ] second\n- [x] third'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('- [ ] first\n- [x] second\n- [x] third')
  })

  it('preserves surrounding text and other markdown around the toggled line', () => {
    const content = '## Tasks\n\n- [ ] a **bold** todo\n\nSome paragraph.'
    expect(toggleMarkdownCheckbox(content, 0)).toBe(
      '## Tasks\n\n- [x] a **bold** todo\n\nSome paragraph.'
    )
  })

  it('preserves indentation on the toggled line', () => {
    expect(toggleMarkdownCheckbox('  - [ ] nested', 0)).toBe('  - [x] nested')
  })

  it('skips checkbox-looking text inside fenced code blocks', () => {
    const content = '- [ ] real todo\n```\n- [ ] not a real checkbox\n```'
    // Index 0 must land on the real todo, not the one inside the fence.
    expect(toggleMarkdownCheckbox(content, 0)).toBe(
      '- [x] real todo\n```\n- [ ] not a real checkbox\n```'
    )
  })

  it('is a no-op for an out-of-range index', () => {
    const content = '- [ ] only one'
    expect(toggleMarkdownCheckbox(content, 5)).toBe(content)
  })

  it('is a no-op for empty content', () => {
    expect(toggleMarkdownCheckbox('', 0)).toBe('')
  })
})
