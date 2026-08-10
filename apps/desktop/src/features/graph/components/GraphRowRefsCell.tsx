import type { GitGraphNode, GitRef } from '@git-manager/git-types'
import { RefLabel } from './RefLabel'
import { RefLabelGroup } from './RefLabelGroup'
import { TagCreationInput } from './TagCreationInput'
import { REF_CONNECTOR_LINE_OPACITY_HEX } from '../lib/graphLayout'
import { isSyntheticRow } from '../lib/syntheticRows'

interface GraphRowRefsCellProps {
  node: GitGraphNode
  /** Center x (cell-relative to the graph column) where this row's marker renders — the connector
   *  line extends up to it, clamped or not (see `graphColumnSizing.ts`). */
  markerX: number
  /** True when this commit carries a stash ref: a stash shows no badge at all. */
  isStashCommit: boolean
  /** Branch owning this row's lane, hinted faintly on hover when the commit has no badge. */
  laneRef?: GitRef
  /** Tag short names the user keeps off the graph — their badge is dropped, the commit stays. */
  hiddenTags?: string[]
  /** Branches kept off the graph, on the same terms as the tags — `main` / `origin/main`. */
  hiddenBranches?: string[]
  /** True while this row is awaiting an inline tag name — the cell shows the input instead. */
  isTagDraft?: boolean
  onSubmitTag?: (name: string) => void
  onCancelTag?: () => void
}

/**
 * The refs column of one graph row: the commit's branch/tag badges, and the line connecting them
 * to its marker.
 *
 * It is the only column with real rules of its own rather than a formatted value, which is why it
 * is a component instead of another `case` in {@link GraphRowCell}'s switch: a badge can be hidden
 * by the user, replaced by the lane hint when the commit carries none, replaced entirely by the
 * inline tag input, or suppressed outright on a stash.
 */
export function GraphRowRefsCell({
  node,
  markerX,
  isStashCommit,
  laneRef,
  hiddenTags = [],
  hiddenBranches = [],
  isTagDraft,
  onSubmitTag,
  onCancelTag,
}: GraphRowRefsCellProps) {
  if (isTagDraft && onSubmitTag && onCancelTag) {
    return (
      <div className="flex h-full w-full min-w-0 items-center">
        <TagCreationInput variant="inline" onSubmit={onSubmitTag} onCancel={onCancelTag} />
      </div>
    )
  }
  if (isStashCommit) return null

  // A hidden tag or branch loses its badge only — the commit keeps its row and its other refs,
  // which is what separates this from a hidden stash (dropped from the log by the backend).
  // `shortName` tells local from remote on its own (`main` vs `origin/main`), which is exactly
  // how the hidden list names them.
  const filteredRefs =
    hiddenTags.length || hiddenBranches.length
      ? node.refs.filter(
          (r) =>
            !(r.type === 'tag' && hiddenTags.includes(r.shortName)) &&
            !((r.type === 'remote' || r.type === 'branch') && hiddenBranches.includes(r.shortName))
        )
      : node.refs

  if (filteredRefs.length === 0) {
    // No ref badge of its own: on hover, faintly hint the branch owning this commit's lane.
    // Never on the synthetic WIP / conflict rows.
    const isRealCommit = !isSyntheticRow(node.commit.oid)
    if (!isRealCommit || !laneRef) return null
    return (
      <div
        className="pointer-events-none flex h-full w-full min-w-0 items-center overflow-hidden opacity-0 transition-opacity duration-150 group-hover:opacity-40"
        data-testid="lane-branch-hint"
      >
        <RefLabel gitRef={laneRef} color={node.color} interactive={false} />
      </div>
    )
  }

  // Only the LOCAL main/master branch's row draws a solid, full-color connector — its mainline
  // reads as the repo's primary line. Every other ref (origin/main included) gets the faint
  // connector like the rest.
  const hasLocalMain = filteredRefs.some(
    (r) => r.type === 'branch' && (r.shortName === 'main' || r.shortName === 'master')
  )
  return (
    <div className="flex h-full w-full min-w-0 items-center overflow-visible">
      <RefLabelGroup refs={filteredRefs} color={node.color} />
      <div
        className="pointer-events-none ml-2 h-[2px] flex-1 transition-colors"
        style={{
          backgroundColor: hasLocalMain
            ? node.color
            : `${node.color}${REF_CONNECTOR_LINE_OPACITY_HEX}`,
          marginRight: `-${markerX + 15}px`,
        }}
      />
    </div>
  )
}
