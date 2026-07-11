import type { editor, IRange } from 'monaco-editor'
import type { DecorationSpec } from '../mergeDecorations'
import type { ViewZoneSpec } from '../mergeDecorations'
import type { InlineDecorationSpec } from '../mergeIntraLineDiff'

/** `DecorationSpec.endLine` is already inclusive (see mergeDecorations.ts) — exactly what
 * `isWholeLine: true` expects, no boundary adjustment here.
 *
 * `className`/`marginClassName` carry different fill intensities (muted `merge-text-*` vs.
 * vivid `merge-vivid-*` — see mergeDecorations.ts): a heavy fill behind actual code
 * text fights with legibility, but the same intensity in the gutter/line-number margin (no text
 * to compete with) reads better vivid. `lineNumberClassName` turned out to only color the
 * line-number digit's own narrow div, not the full gutter row — `marginClassName` is the one
 * that paints the whole margin width (line numbers + the reserved lineDecorationsWidth strip
 * together). */
export function toMonacoDecoration(spec: DecorationSpec): editor.IModelDeltaDecoration {
  const range: IRange = { startLineNumber: spec.startLine, startColumn: 1, endLineNumber: spec.endLine, endColumn: 1 }
  // `zIndex` is defensive: without it, decorations can render underneath other decoration
  // layers Monaco itself manages (current-line highlight, etc.) depending on paint order.
  return {
    range,
    options: { isWholeLine: true, className: spec.className, marginClassName: spec.marginClassName, zIndex: 10 },
  }
}

/** Intra-line (character-precise) highlight: `inlineClassName` styles just the changed span of
 * text inside a line, over the block's whole-line fill — no `isWholeLine`, and no margin class
 * (the gutter belongs to the block, not to a word). */
export function toInlineMonacoDecoration(spec: InlineDecorationSpec): editor.IModelDeltaDecoration {
  const range: IRange = {
    startLineNumber: spec.line,
    startColumn: spec.startColumn,
    endLineNumber: spec.line,
    endColumn: spec.endColumn,
  }
  return { range, options: { inlineClassName: spec.inlineClassName, zIndex: 11 } }
}

/** Replaces a pane's alignment filler zones wholesale (remove previous, add current) inside a
 * single `changeViewZones` transaction — zones are recomputed from scratch on every placement
 * change (mirroring how decorations are re-`set()`), so there's no per-zone diffing to do.
 * Removing an id Monaco no longer knows (it drops all zones itself when the pane's model is
 * swapped on file switch) is a harmless no-op. Returns the new zone ids for the next call. */
export function applyViewZones(
  editorInstance: editor.IStandaloneCodeEditor,
  previousIds: string[],
  specs: ViewZoneSpec[]
): string[] {
  const ids: string[] = []
  editorInstance.changeViewZones((accessor) => {
    for (const id of previousIds) accessor.removeZone(id)
    for (const spec of specs) {
      const domNode = document.createElement('div')
      domNode.className = spec.className
      if (spec.id) {
        domNode.setAttribute('data-zone-id', spec.id)
      }
      ids.push(accessor.addZone({ afterLineNumber: spec.afterLineNumber, heightInLines: spec.heightInLines, domNode }))
    }
  })
  return ids
}

/** `setHiddenAreas` exists on Monaco's runtime standalone editor but isn't part of the public
 * `IStandaloneCodeEditor` typings, so callers need a narrow escape hatch instead of casting to
 * `any` at every call site. */
type EditorWithHiddenAreas = editor.IStandaloneCodeEditor & {
  setHiddenAreas?: (ranges: IRange[]) => void
}

export function setHiddenAreas(editorInstance: editor.IStandaloneCodeEditor | null, ranges: IRange[]): void {
  ;(editorInstance as EditorWithHiddenAreas | null)?.setHiddenAreas?.(ranges)
}

/** The minimal slice of `editor.ITextModel` the line-based edit helpers below read — narrow on
 * purpose so unit tests can hand in a plain array-backed fake instead of a real Monaco model. */
export interface LineTextModel {
  getLineCount: () => number
  getLineContent: (line: number) => string
  getLineMaxColumn: (line: number) => number
}

/** Computes the Monaco edit range/text for replacing an explicit `[startLine, startLine+lineCount)`
 * range with `newLines` — used both to replace a side's existing content and, when `lineCount`
 * is 0, to insert content at that boundary (accepting a side that wasn't included before).
 * Extends into the start of the following line to consume the range's own trailing newline
 * (clean full removal when `newLines` is empty) — except at the very end of the document, where
 * there's no following line, so the *preceding* line's newline is consumed instead. */
export function buildRangeEdit(
  model: LineTextModel,
  startLine: number,
  lineCount: number,
  newLines: string[]
): { range: IRange; text: string } {
  const totalLines = model.getLineCount()

  if (startLine + lineCount <= totalLines) {
    return {
      range: { startLineNumber: startLine, startColumn: 1, endLineNumber: startLine + lineCount, endColumn: 1 },
      text: newLines.length > 0 ? newLines.join('\n') + '\n' : '',
    }
  }

  const lastLine = Math.min(Math.max(startLine + lineCount - 1, startLine), totalLines)
  const lastCol = model.getLineMaxColumn(lastLine)
  if (startLine > 1) {
    const prevLine = startLine - 1
    return {
      range: { startLineNumber: prevLine, startColumn: model.getLineMaxColumn(prevLine), endLineNumber: lastLine, endColumn: lastCol },
      text: newLines.length > 0 ? '\n' + newLines.join('\n') : '',
    }
  }
  return {
    range: { startLineNumber: startLine, startColumn: 1, endLineNumber: lastLine, endColumn: lastCol },
    text: newLines.join('\n'),
  }
}

/** `true` when replacing `[startLine, startLine+lineCount)` with `newLines` would actually
 * change the buffer — lets callers skip a no-op `executeEdits` (which would still dirty Monaco's
 * undo stack). */
export function checkTextChanges(
  model: LineTextModel,
  startLine: number,
  lineCount: number,
  newLines: string[]
): boolean {
  if (lineCount !== newLines.length) return true
  for (let i = 0; i < lineCount; i++) {
    if (model.getLineContent(startLine + i) !== newLines[i]) return true
  }
  return false
}
