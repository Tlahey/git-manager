// Provider presets (the user-facing choice + its wire protocol)
export type { AiProtocol, AiPresetId, AiPresetDefinition } from './presets'
export { AI_PRESETS, getAiPreset } from './presets'

// Config / wire types
export type {
  AiConnectionConfig,
  AiProviderStatus,
  AiCheckConfig,
  AiGenerateConfig,
  AiContext,
  AiContextFile,
  AiContextScope,
  AiActivity,
  AiActivityCommit,
  AiActivityPending,
  CommitConvention,
  JsonSchema,
} from './config'

// The extensibility runtime: describe a feature once, wrap it into a typed service.
export type {
  AiFeature,
  StreamingFeature,
  CompletionFeature,
  AiTransport,
  StreamingFeatureService,
  CompletionFeatureService,
  AiStatusService,
} from './runtime'
export {
  resolveGenerateConfig,
  createStreamingService,
  createCompletionService,
  createStatusService,
} from './runtime'

// Shipped features (one "service per feature" is assembled from these in the app's api layer).
export {
  commitMessageFeature,
  COMMIT_MESSAGE_INSTRUCTION,
  buildCommitUserPrompt,
  detectScope,
  truncateDiff,
  fileGroupingFeature,
  FILE_GROUPING_INSTRUCTION,
  FILE_GROUPING_SCHEMA,
  buildGroupingUserPrompt,
  parseCommitPlan,
  dailySummaryFeature,
  DAILY_SUMMARY_INSTRUCTION,
  DAILY_SUMMARY_SCHEMA,
  buildDailySummaryPrompt,
  parseDailySummary,
  prDescriptionFeature,
  PR_DESCRIPTION_INSTRUCTION,
  buildPrDescriptionUserPrompt,
  DEFAULT_COMMIT_TYPES,
  parseCommitlintRules,
  isConventionalHistory,
  compilePattern,
  buildConventionSection,
  buildRecentCommitsSection,
  buildUserInstructionsSection,
  buildCommitStyleSection,
  validateCommitSubject,
} from './features'
export type {
  ProposedCommit,
  DailySummary,
  PrDescriptionInput,
  CommitlintRules,
  CommitStyleContext,
  CommitValidation,
  CommitValidationProblem,
} from './features'
