export { ConflictResolver } from './ConflictResolver'
export type {
  ConflictResolverProps,
  ConflictResolverRef,
  ConflictResolverPanel,
  ConflictResolverEditorConfig,
} from './ConflictResolver'
export type {
  ConflictResolverActionsConfig,
  ConflictResolverLabels,
} from './ConflictResolverHeader'
export { CodePane } from './CodePane'
export type { CodePaneEditorComponent, CodePaneEditorProps } from './CodePane'
export { CodeEditor } from './CodeEditor'
export type { CodeEditorProps } from './CodeEditor'
export { MonacoEditor, MonacoDiffEditor, languageForFilePath } from './monaco/setup'
export {
  monacoThemes,
  registerMonacoThemes,
  registerAndApplyDynamicTheme,
} from './monaco/themes'
export type { MonacoThemeConfig } from './monaco/themes'
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
