/** Structural twin of the `MergeBlock` DTO in `@git-manager/git-types` — redefined here so the
 * library has no dependency on the app's IPC types. Any object with this shape (including the
 * git-types one) is accepted as-is thanks to TypeScript's structural typing.
 *
 * Naming is generic left/right agnostic in spirit but keeps the historical `ours`/`theirs`
 * field names: `theirs*` describes the LEFT pane (incoming side in a merge, "original" in a
 * 2-panel diff) and `ours*` the RIGHT pane (current side in a merge, "modified" in a diff). */
export type MergeBlockKind = 'unchanged' | 'ours-only' | 'theirs-only' | 'both-same' | 'both-different'

export interface MergeBlock {
  blockId: number
  kind: MergeBlockKind
  oursStartLine: number
  oursLineCount: number
  theirsStartLine: number
  theirsLineCount: number
  oursLines: string[]
  theirsLines: string[]
  baseLines?: string[]
}
