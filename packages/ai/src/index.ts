// Provider presets (the user-facing choice + its wire protocol)
export type { AiProtocol, AiPresetId, AiPresetDefinition } from './presets'
export { AI_PRESETS, getAiPreset, migrateAiPresetId } from './presets'

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
  AiModelProbeResult,
} from './runtime'
export {
  resolveGenerateConfig,
  createStreamingService,
  createCompletionService,
  createStatusService,
  MODEL_PROBE_INSTRUCTION,
  MODEL_PROBE_PROMPT,
  MODEL_PROBE_MAX_TIMEOUT_SECONDS,
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
  changeExplanationFeature,
  CHANGE_EXPLANATION_INSTRUCTION,
  buildChangeExplanationPrompt,
  branchExplanationFeature,
  BRANCH_EXPLANATION_INSTRUCTION,
  buildBranchExplanationPrompt,
  commitExplanationFeature,
  COMMIT_EXPLANATION_INSTRUCTION,
  buildCommitExplanationPrompt,
  workingExplanationFeature,
  WORKING_EXPLANATION_INSTRUCTION,
  buildWorkingExplanationPrompt,
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
  ChangeExplanationInput,
  ChangeExplanationFile,
  BranchExplanationInput,
  CommitExplanationInput,
  CommitExplanationCommit,
  WorkingExplanationInput,
  CommitlintRules,
  CommitStyleContext,
  CommitValidation,
  CommitValidationProblem,
} from './features'
