import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import {
  type LineTextModel,
  applyViewZones,
  buildRangeEdit,
  checkTextChanges,
  setHiddenAreas,
  toInlineMonacoDecoration,
  toMonacoDecoration,
} from './monacoInterop'

/** Array-backed stand-in for the slice of ITextModel the edit helpers read. */
function fakeModel(lines: string[]): LineTextModel {
  return {
    getLineCount: () => lines.length,
    getLineContent: (line: number) => lines[line - 1] ?? '',
    getLineMaxColumn: (line: number) => (lines[line - 1] ?? '').length + 1,
  }
}

describe('toMonacoDecoration', () => {
  it('builds a whole-line decoration spanning the inclusive line range', () => {
    const deco = toMonacoDecoration({
      startLine: 3,
      endLine: 5,
      className: 'merge-text-conflict',
      marginClassName: 'merge-vivid-conflict',
    })
    expect(deco.range).toEqual({
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 1,
    })
    expect(deco.options.isWholeLine).toBe(true)
    expect(deco.options.className).toBe('merge-text-conflict')
    expect(deco.options.marginClassName).toBe('merge-vivid-conflict')
  })
})

describe('toInlineMonacoDecoration', () => {
  it('builds a character-precise inline decoration without whole-line or margin styling', () => {
    const deco = toInlineMonacoDecoration({
      line: 2,
      startColumn: 4,
      endColumn: 9,
      inlineClassName: 'merge-inline-modification',
    })
    expect(deco.range).toEqual({
      startLineNumber: 2,
      startColumn: 4,
      endLineNumber: 2,
      endColumn: 9,
    })
    expect(deco.options.inlineClassName).toBe('merge-inline-modification')
    expect(deco.options.isWholeLine).toBeUndefined()
    expect(deco.options.marginClassName).toBeUndefined()
  })
})

describe('buildRangeEdit', () => {
  it('replaces an interior range including its trailing newline', () => {
    const model = fakeModel(['a', 'b', 'c', 'd'])
    expect(buildRangeEdit(model, 2, 1, ['B1', 'B2'])).toEqual({
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 1 },
      text: 'B1\nB2\n',
    })
  })

  it('deletes an interior range cleanly (empty replacement consumes the newline)', () => {
    const model = fakeModel(['a', 'b', 'c'])
    expect(buildRangeEdit(model, 2, 1, [])).toEqual({
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 1 },
      text: '',
    })
  })

  it('inserts at a boundary when lineCount is 0', () => {
    const model = fakeModel(['a', 'b', 'c'])
    expect(buildRangeEdit(model, 2, 0, ['new'])).toEqual({
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      text: 'new\n',
    })
  })

  it('consumes the preceding newline when the range reaches the end of the document', () => {
    const model = fakeModel(['aa', 'bb', 'cc'])
    // Deleting the last line: extend backwards from line 2's end.
    expect(buildRangeEdit(model, 3, 1, [])).toEqual({
      range: { startLineNumber: 2, startColumn: 3, endLineNumber: 3, endColumn: 3 },
      text: '',
    })
  })

  it('replaces the last line without touching the preceding newline when content is provided', () => {
    const model = fakeModel(['aa', 'bb', 'cc'])
    expect(buildRangeEdit(model, 3, 1, ['CC'])).toEqual({
      range: { startLineNumber: 2, startColumn: 3, endLineNumber: 3, endColumn: 3 },
      text: '\nCC',
    })
  })

  it('replaces a whole single-line document in place (no preceding line to lean on)', () => {
    const model = fakeModel(['only'])
    expect(buildRangeEdit(model, 1, 1, ['still only'])).toEqual({
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
      text: 'still only',
    })
  })
})

describe('checkTextChanges', () => {
  const model = fakeModel(['a', 'b', 'c'])

  it('is false when the replacement matches the existing lines exactly', () => {
    expect(checkTextChanges(model, 2, 1, ['b'])).toBe(false)
  })

  it('is true when a line differs', () => {
    expect(checkTextChanges(model, 2, 1, ['B'])).toBe(true)
  })

  it('is true when the line counts differ', () => {
    expect(checkTextChanges(model, 2, 1, ['b', 'b2'])).toBe(true)
    expect(checkTextChanges(model, 2, 1, [])).toBe(true)
  })
})

describe('applyViewZones', () => {
  function fakeZoneEditor() {
    let nextId = 1
    const zones = new Map<
      string,
      { afterLineNumber: number; heightInLines: number; domNode: HTMLElement }
    >()
    const editorInstance = {
      changeViewZones: (
        cb: (accessor: { removeZone: (id: string) => void; addZone: (z: never) => string }) => void
      ) => {
        cb({
          removeZone: (id: string) => {
            zones.delete(id)
          },
          addZone: (zone: never) => {
            const id = `zone-${nextId++}`
            zones.set(
              id,
              zone as { afterLineNumber: number; heightInLines: number; domNode: HTMLElement }
            )
            return id
          },
        })
      },
    } as unknown as editor.IStandaloneCodeEditor
    return { editorInstance, zones }
  }

  it('replaces the previous zones wholesale and returns the new ids', () => {
    const { editorInstance, zones } = fakeZoneEditor()

    const firstIds = applyViewZones(
      editorInstance,
      [],
      [{ afterLineNumber: 2, heightInLines: 1, className: 'merge-zone' }]
    )
    expect(firstIds).toHaveLength(1)
    expect(zones.size).toBe(1)

    const secondIds = applyViewZones(editorInstance, firstIds, [
      { afterLineNumber: 4, heightInLines: 2, className: 'merge-zone', id: '3-ours' },
      { afterLineNumber: 9, heightInLines: 1, className: 'merge-zone' },
    ])
    expect(secondIds).toHaveLength(2)
    expect(zones.has(firstIds[0])).toBe(false)
    expect(zones.size).toBe(2)

    const tagged = zones.get(secondIds[0])!
    expect(tagged.domNode.getAttribute('data-zone-id')).toBe('3-ours')
    expect(tagged.domNode.className).toBe('merge-zone')
    const untagged = zones.get(secondIds[1])!
    expect(untagged.domNode.getAttribute('data-zone-id')).toBeNull()
  })
})

describe('setHiddenAreas', () => {
  it('calls the runtime setHiddenAreas when present and tolerates editors without it (or null)', () => {
    const calls: unknown[] = []
    const withApi = {
      setHiddenAreas: (ranges: unknown) => calls.push(ranges),
    } as unknown as editor.IStandaloneCodeEditor
    const withoutApi = {} as editor.IStandaloneCodeEditor

    setHiddenAreas(withApi, [
      { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 },
    ])
    expect(calls).toHaveLength(1)

    expect(() => setHiddenAreas(withoutApi, [])).not.toThrow()
    expect(() => setHiddenAreas(null, [])).not.toThrow()
  })
})
