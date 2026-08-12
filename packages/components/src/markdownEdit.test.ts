import { describe, it, expect } from 'vitest'
import {
  applyEdit,
  insertBlock,
  insertInline,
  mapLines,
  toggleLinePrefix,
  toggleWrap,
  wrapFence,
  type MarkdownSelection,
} from './markdownEdit'

function select(value: string, start: number, end = start): MarkdownSelection {
  return { value, selectionStart: start, selectionEnd: end }
}

describe('applyEdit', () => {
  it('replaces the edited range and reports the new selection', () => {
    const state = select('hello world', 6, 11)
    expect(
      applyEdit(state, { from: 6, to: 11, text: 'there', selectionStart: 6, selectionEnd: 11 })
    ).toEqual({
      value: 'hello there',
      selectionStart: 6,
      selectionEnd: 11,
    })
  })
})

describe('toggleWrap', () => {
  it('wraps the selection and keeps it selected', () => {
    const state = select('hello world', 6, 11)
    expect(applyEdit(state, toggleWrap(state, '**', '**'))).toEqual({
      value: 'hello **world**',
      selectionStart: 8,
      selectionEnd: 13,
    })
  })

  it('unwraps when the markers sit outside the selection', () => {
    const state = select('hello **world**', 8, 13)
    expect(applyEdit(state, toggleWrap(state, '**', '**'))).toEqual({
      value: 'hello world',
      selectionStart: 6,
      selectionEnd: 11,
    })
  })

  it('unwraps when the markers sit inside the selection', () => {
    const state = select('hello **world**', 6, 15)
    expect(applyEdit(state, toggleWrap(state, '**', '**')).value).toBe('hello world')
  })

  it('leaves the caret between the markers when nothing is selected', () => {
    const state = select('hello ', 6)
    expect(applyEdit(state, toggleWrap(state, '**', '**'))).toEqual({
      value: 'hello ****',
      selectionStart: 8,
      selectionEnd: 8,
    })
  })

  it('replaces only the smallest range it has to', () => {
    const state = select('hello world', 6, 11)
    expect(toggleWrap(state, '**', '**')).toMatchObject({ from: 6, to: 11 })
  })
})

describe('mapLines', () => {
  it('covers every line the selection touches, even partially', () => {
    const state = select('one\ntwo\nthree', 2, 5)
    const edit = mapLines(state, (lines) => lines.map((line) => line.toUpperCase()))
    expect(applyEdit(state, edit)).toEqual({
      value: 'ONE\nTWO\nthree',
      selectionStart: 0,
      selectionEnd: 7,
    })
  })
})

describe('toggleLinePrefix', () => {
  it('prefixes every touched line', () => {
    const state = select('one\ntwo', 0, 7)
    expect(applyEdit(state, toggleLinePrefix(state, '- ')).value).toBe('- one\n- two')
  })

  it('strips the prefix when every line already has it', () => {
    const state = select('- one\n- two', 0, 11)
    expect(applyEdit(state, toggleLinePrefix(state, '- ')).value).toBe('one\ntwo')
  })

  it('normalizes a mixed block instead of double-prefixing', () => {
    const state = select('- one\ntwo', 0, 9)
    expect(applyEdit(state, toggleLinePrefix(state, '- ')).value).toBe('- one\n- two')
  })
})

describe('insertBlock', () => {
  it('opens a new line when the caret sits mid-line', () => {
    const state = select('text', 4)
    expect(applyEdit(state, insertBlock(state, '---\n', 4)).value).toBe('text\n---\n')
  })

  it('inserts as-is at the start of a line', () => {
    const state = select('text\n', 5)
    expect(applyEdit(state, insertBlock(state, '---\n', 4)).value).toBe('text\n---\n')
  })

  it('selects the placeholder it points at', () => {
    const state = select('', 0)
    expect(applyEdit(state, insertBlock(state, '| Cell |\n', 2, 4))).toEqual({
      value: '| Cell |\n',
      selectionStart: 2,
      selectionEnd: 6,
    })
  })
})

describe('insertInline', () => {
  it('replaces the selection and places the caret', () => {
    const state = select('a b', 2, 3)
    expect(applyEdit(state, insertInline(state, '@', 1))).toEqual({
      value: 'a @',
      selectionStart: 3,
      selectionEnd: 3,
    })
  })
})

describe('wrapFence', () => {
  it('fences the selection and keeps the body selected', () => {
    const state = select('const a = 1', 0, 11)
    expect(applyEdit(state, wrapFence(state))).toEqual({
      value: '```\nconst a = 1\n```\n',
      selectionStart: 4,
      selectionEnd: 15,
    })
  })

  it('falls back to the template when nothing is selected', () => {
    const state = select('', 0)
    expect(applyEdit(state, wrapFence(state, 'mermaid', 'graph TD')).value).toBe(
      '```mermaid\ngraph TD\n```\n'
    )
  })
})
