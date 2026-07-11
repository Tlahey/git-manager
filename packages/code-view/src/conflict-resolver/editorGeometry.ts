import type { editor } from 'monaco-editor'

/** Computes a line's top Y offset (content space, before scroll) by walking every line below
 * `lineNumber`, skipping lines inside hidden (collapsed) ranges and adding the height of any
 * view zone anchored along the way — Monaco's own `getTopForLineNumber` can't be trusted here
 * because it throws for lines inside `setHiddenAreas` ranges. A line that is itself hidden
 * resolves to the bottom of the last visible line before its range. */
export function getTopForLineNumberSafe(
  editor: editor.IStandaloneCodeEditor,
  lineNumber: number,
  lineHeight: number,
  hiddenRanges: { start: number; end: number }[],
  viewZones: { afterLineNumber: number; heightInLines: number }[]
): number {
  if (lineNumber <= 1) return 0

  // If the line itself is inside a hidden range, its top is the bottom of the last visible line before the range
  for (const range of hiddenRanges) {
    if (lineNumber >= range.start && lineNumber <= range.end) {
      return getTopForLineNumberSafe(editor, range.start - 1, lineHeight, hiddenRanges, viewZones) + lineHeight
    }
  }

  let y = 0
  for (let i = 1; i < lineNumber; i++) {
    let hidden = false
    for (const range of hiddenRanges) {
      if (i >= range.start && i <= range.end) {
        hidden = true
        break
      }
    }
    if (!hidden) {
      y += lineHeight
    }
    for (const zone of viewZones) {
      if (zone.afterLineNumber === i) {
        y += zone.heightInLines * lineHeight
      }
    }
  }
  return y
}
