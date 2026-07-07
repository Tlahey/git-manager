export { ConflictResolver } from './ConflictResolver'
export type {
  ConflictResolverProps,
  ConflictResolverRef,
  ConflictResolverPanel,
  ConflictResolverEditorConfig,
} from './ConflictResolver'
export type { ConflictResolverActionsConfig } from './ConflictResolverHeader'
export { CodePane } from './CodePane'
export type { CodePaneEditorComponent, CodePaneEditorProps } from './CodePane'
export { MergeConnectorOverlay } from './MergeConnectorOverlay'
export type { ConnectorSegment } from './MergeConnectorOverlay'
export type { MergeBlock, MergeBlockKind } from './types'
export {
  changeKindForBlock,
  centerLinesForBlock,
  computeInitialCenterText,
  computeInitialPlacements,
} from './mergeBlockLayout'
export type { BlockPlacement, MergeSide } from './mergeBlockLayout'
