import { SplitButton } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Textarea,
  Badge,
  Progress,
  Spinner,
  cn,
  Checkbox,
  Tooltip,
  LlmIcon,
} from '@git-manager/ui'
import {
  AlertTriangle,
  Archive,
  Check,
  GitCommitHorizontal,
  Layers,
  ShieldOff,
  Square,
} from 'lucide-react'
import type { GitStatus } from '@git-manager/git-types'
import { useWipCommitPanel } from '../../../hooks/useWipCommitPanel'
import { useCommitBatchReview } from '../../../hooks/useCommitBatchReview'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import { CommitBatchReviewPanel } from './CommitBatchReviewPanel'
import { PrPublishButton } from '../../github-panels/pr/PrPublishButton'
import type { ProcessedFileItem } from '../../common/CommitFileList'

interface WipStagingPanelProps {
  repoPath: string
  gitStatus: GitStatus | undefined
  allWipChanges: ProcessedFileItem[]
  onRefresh?: () => void
}

export function WipStagingPanel({
  repoPath,
  gitStatus,
  allWipChanges,
  onRefresh,
}: WipStagingPanelProps) {
  const { t } = useTranslation('git')
  const aiEnabled = useAiEnabled()

  const {
    activeTab,
    setActiveTab,
    isAmend,
    handleToggleAmend,
    stashMessage,
    setStashMessage,
    includeUntracked,
    setIncludeUntracked,
    isStashing,
    handleStash,
    batchMode,
    setBatchMode,
    wipBatches,
    batchMessages,
    setBatchMessages,
    batchGenerating,
    generateMessageForBatch,
    commitBatch,
    generateAllBatchMessages,
    commitAllBatches,
    isGeneratingAllBatches,
    isCommittingAllBatches,
    commitMessage,
    setCommitMessage,
    isCommitting,
    handleCommitWip,
    handleGenerateCommitMessage,
    isGenerating,
    commitValidation,
    commitProgress,
  } = useWipCommitPanel(repoPath, gitStatus, allWipChanges, t, onRefresh)

  // Case 2: AI splits all working changes into a plan of atomic commits, reviewed in a dialog.
  const batchReview = useCommitBatchReview(repoPath, allWipChanges, t, onRefresh)

  const statusIcons: Record<string, string> = {
    added: 'text-green-500 font-bold text-[10px]',
    modified: 'text-yellow-500 font-bold text-[10px]',
    deleted: 'text-red-500 font-bold text-[10px]',
    renamed: 'text-blue-500 font-bold text-[10px]',
    untracked: 'text-muted-foreground font-bold text-[10px]',
  }

  const statusLetters: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
  }

  return (
    <div
      data-testid="wip-staging-panel"
      className="space-y-3 border-t border-border/55 px-4 pb-4 pt-2"
    >
      <div className="flex items-center justify-between">
        <button
          data-testid="batch-mode-toggle"
          onClick={() => setBatchMode((b) => !b)}
          className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-bold text-primary hover:opacity-85"
        >
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>
            {batchMode ? t('commitDetails.batchCommit.back') : t('commitDetails.batchCommit.title')}
          </span>
        </button>
      </div>

      {batchMode ? (
        /* Smart Batch Mode */
        <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-1 animate-duration-150">
          <p className="border-b border-border/20 pb-1 text-[10px] font-medium leading-relaxed text-muted-foreground">
            {t('commitDetails.batchCommit.subtitle')}
          </p>

          {/* Run the whole plan in one go. Both are sequential — each group re-stages the index to
              isolate itself, so they cannot overlap. Hidden when there is nothing to group. */}
          {Object.keys(wipBatches).length > 0 && (
            <div className="flex items-center gap-2">
              {aiEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="batch-generate-all"
                  className="h-7 flex-1 gap-1 text-[10px] font-semibold"
                  onClick={generateAllBatchMessages}
                  disabled={isGeneratingAllBatches || isCommittingAllBatches}
                >
                  {isGeneratingAllBatches ? (
                    <Spinner className="h-2.5 w-2.5" />
                  ) : (
                    <LlmIcon className="h-3 w-3 text-primary" />
                  )}
                  <span>{t('commitDetails.batchCommit.generateAll')}</span>
                </Button>
              )}

              <Button
                size="sm"
                data-testid="batch-commit-all"
                className="h-7 flex-1 gap-1 text-[10px] font-semibold"
                onClick={commitAllBatches}
                disabled={
                  isGeneratingAllBatches ||
                  isCommittingAllBatches ||
                  // Nothing to do until at least one group carries a message.
                  !Object.keys(wipBatches).some((name) => batchMessages[name]?.trim())
                }
              >
                {isCommittingAllBatches ? (
                  <Spinner className="h-2.5 w-2.5" />
                ) : (
                  <Check className="h-3 w-3 text-white" />
                )}
                <span>{t('commitDetails.batchCommit.commitAll')}</span>
              </Button>
            </div>
          )}

          {Object.keys(wipBatches).map((groupName) => {
            const files = wipBatches[groupName]
            const msg = batchMessages[groupName] ?? ''
            // `isGen` is this group's own turn — it drives the spinner and the textarea, so it must
            // stay false for the groups an "all" run has not reached yet. `batchBusy` is the
            // sequence itself: it only disables the actions, because a per-group action started
            // mid-run would stage against the other's index.
            const isGen = batchGenerating[groupName]
            const batchBusy = isGeneratingAllBatches || isCommittingAllBatches

            return (
              <div
                key={groupName}
                data-testid={`batch-group-${groupName}`}
                className="space-y-2.5 rounded-lg border border-border/40 bg-muted/10 p-3"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono text-xs font-bold text-primary">
                    /{groupName}
                  </span>
                  <Badge variant="secondary" className="text-[9px] font-bold">
                    {t('commitDetails.batchCommit.fileCount', { count: files.length })}
                  </Badge>
                </div>

                {/* Files in Group */}
                <div className="max-h-24 space-y-0.5 overflow-y-auto rounded border border-border/30 bg-card p-1.5">
                  {files.map((file) => (
                    <div
                      key={file.path}
                      className="flex w-full min-w-0 items-center justify-between py-0.5 font-mono text-[10px]"
                    >
                      <div className="mr-4 flex min-w-0 flex-1 items-center gap-1.5">
                        <span
                          className={cn(
                            statusIcons[file.status],
                            'min-w-[12px] shrink-0 select-none text-center'
                          )}
                        >
                          {statusLetters[file.status]}
                        </span>
                        {(() => {
                          const lastSlash = file.path.lastIndexOf('/')
                          if (lastSlash === -1) return null
                          const dir = file.path.substring(0, lastSlash + 1)
                          return (
                            <span className="min-w-0 shrink select-text truncate pr-0.5 text-[9px] leading-tight text-muted-foreground/45">
                              {dir}
                            </span>
                          )
                        })()}
                      </div>
                      <span className="min-w-0 shrink-0 select-all truncate text-[9px] font-semibold leading-tight text-foreground">
                        {(() => {
                          const lastSlash = file.path.lastIndexOf('/')
                          return lastSlash === -1 ? file.path : file.path.substring(lastSlash + 1)
                        })()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Message Box */}
                <div className="space-y-1.5">
                  <Textarea
                    data-testid={`batch-message-${groupName}`}
                    value={msg}
                    onChange={(e) =>
                      setBatchMessages((prev) => ({
                        ...prev,
                        [groupName]: e.target.value,
                      }))
                    }
                    placeholder={t('commitDetails.batchCommit.placeholder')}
                    rows={2}
                    className="resize-none font-mono text-[11px]"
                    disabled={isGen}
                  />

                  <div className="flex items-center gap-2">
                    {aiEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 gap-1 text-[10px] font-semibold"
                        onClick={() => generateMessageForBatch(groupName, files)}
                        disabled={isGen || batchBusy}
                      >
                        {isGen ? (
                          <Spinner className="h-2.5 w-2.5" />
                        ) : (
                          <LlmIcon className="h-3 w-3 text-primary" />
                        )}
                        <span>
                          {isGen ? t('commitDetails.batchCommit.generating') : t('commit.generate')}
                        </span>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      data-testid={`batch-commit-${groupName}`}
                      className="h-7 flex-1 gap-1 text-[10px] font-semibold"
                      onClick={() => commitBatch(groupName, files)}
                      disabled={isGen || batchBusy || !msg.trim()}
                    >
                      <Check className="h-3 w-3 text-white" />
                      <span>{t('commitDetails.batchCommit.commitBatch')}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Classic Staged / Unstaged List + Commit / Stash panel */
        <div className="space-y-1.5 pt-1">
          {/* ── TABS BAR (positioned just above the commit container) ── */}
          <div className="flex items-center gap-1 px-1">
            <Tooltip content={t('commit.title', { defaultValue: 'Commit' })}>
              <button
                type="button"
                data-testid="tab-commit"
                onClick={() => setActiveTab('commit')}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1 text-xs font-semibold transition-colors',
                  activeTab === 'commit'
                    ? 'shadow-xs border border-b-0 border-border/60 bg-card text-foreground'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                )}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5 text-primary" />
                {activeTab === 'commit' && (
                  <span>{t('commit.title', { defaultValue: 'Commit' })}</span>
                )}
              </button>
            </Tooltip>

            <Tooltip content={t('toolbar.stash', { defaultValue: 'Stash' })}>
              <button
                type="button"
                data-testid="tab-stash"
                onClick={() => setActiveTab('stash')}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1 text-xs font-semibold transition-colors',
                  activeTab === 'stash'
                    ? 'shadow-xs border border-b-0 border-border/60 bg-card text-foreground'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                )}
              >
                <Archive className="h-3.5 w-3.5 text-primary" />
                {activeTab === 'stash' && (
                  <span>{t('toolbar.stash', { defaultValue: 'Stash' })}</span>
                )}
              </button>
            </Tooltip>
          </div>

          {/* ── CONTAINER (Textarea, checkbox, actions) ── */}
          <div className="space-y-3 rounded-b-lg rounded-tr-lg border border-border/40 bg-card p-3 shadow-xs">
            {activeTab === 'commit' ? (
              /* COMMIT FORM */
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Textarea
                    data-testid="commit-message-input"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder={t('commit.placeholder')}
                    rows={3}
                    className="resize-none font-mono text-xs"
                    disabled={isGenerating}
                  />
                  {/* One call per staged file, so on a large change this runs for a while. The Stop
                    button alone does not say what it is waiting on — the count does. */}
                  {commitProgress && (
                    <div className="space-y-1" data-testid="commit-message-progress">
                      <p className="text-[10px] text-muted-foreground">
                        {commitProgress.phase === 'summarizing'
                          ? t('commit.summarizing', {
                              done: commitProgress.completed,
                              total: commitProgress.total,
                            })
                          : t('commit.composing')}
                      </p>
                      <Progress
                        value={
                          commitProgress.phase === 'composing'
                            ? 100
                            : Math.round(
                                (commitProgress.completed / Math.max(1, commitProgress.total)) * 100
                              )
                        }
                      />
                    </div>
                  )}
                  {commitValidation && !commitValidation.valid && (
                    <div
                      data-testid="commit-validation-warning"
                      className="flex items-start gap-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 text-[10px] text-yellow-600 dark:text-yellow-400"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <div className="space-y-0.5">
                        <p className="font-semibold">{t('commit.conventionWarning')}</p>
                        {commitValidation.problems.map((p) => (
                          <p key={p.code}>{p.message}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Checkbox placement: BELOW the text area */}
                <label
                  data-testid="commit-amend-checkbox-label"
                  className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Checkbox
                    data-testid="commit-amend-checkbox"
                    checked={isAmend}
                    onChange={(e) => handleToggleAmend(e.target.checked)}
                  />
                  <span>
                    {t('conflictEditor.amendPreviousCommit', {
                      defaultValue: 'Amender le commit précédent',
                    })}
                  </span>
                </label>

                <div className="flex gap-2">
                  {aiEnabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="commit-generate-button"
                      className="h-8 flex-1 gap-1 text-xs"
                      onClick={handleGenerateCommitMessage}
                      disabled={gitStatus?.staged?.length === 0 && !isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Square className="h-3 w-3 animate-pulse text-destructive" />
                          {t('commit.stop')}
                        </>
                      ) : (
                        <>
                          <LlmIcon className="h-3 w-3 text-primary" />
                          {t('commit.generate')}
                        </>
                      )}
                    </Button>
                  )}

                  <div className="flex-1">
                    <SplitButton
                      size="sm"
                      fullWidth
                      testIdPrefix="commit"
                      label={
                        isAmend ? t('commit.amend', { defaultValue: 'Amend' }) : t('commit.commit')
                      }
                      {...(isCommitting ? { icon: <Spinner className="h-3 w-3" /> } : {})}
                      onClick={() => void handleCommitWip()}
                      busy={isCommitting}
                      disabled={
                        ((gitStatus?.staged?.length ?? 0) === 0 && !isAmend) ||
                        !commitMessage.trim()
                      }
                      menuLabel={t('commit.options')}
                      actions={[
                        {
                          key: 'skip-hooks',
                          label: t('commit.skipHooks'),
                          icon: <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />,
                          onSelect: () => void handleCommitWip({ skipHooks: true }),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* Commit + push + open a GitHub PR flow */}
                <PrPublishButton
                  repoPath={repoPath}
                  commitMessage={commitMessage}
                  disabled={
                    (gitStatus?.staged?.length ?? 0) === 0 || !commitMessage.trim() || isCommitting
                  }
                />

                {/* AI Batch atomic commits dialog trigger */}
                {aiEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="ai-batch-generate-button"
                    className="h-8 w-full gap-1.5 text-xs"
                    onClick={batchReview.openAndGenerate}
                    disabled={allWipChanges.length === 0 || batchReview.isGenerating}
                  >
                    <LlmIcon className="h-3.5 w-3.5 text-primary" />
                    {t('commitDetails.aiBatch.trigger')}
                  </Button>
                )}
              </div>
            ) : (
              /* STASH FORM */
              <div className="space-y-3">
                <Textarea
                  data-testid="stash-message-input"
                  value={stashMessage}
                  onChange={(e) => setStashMessage(e.target.value)}
                  placeholder={t('stash.pushDialog.placeholder', {
                    defaultValue: 'Stash message (optional)...',
                  })}
                  rows={3}
                  className="resize-none font-mono text-xs"
                />

                {/* Checkbox placement: BELOW the text area */}
                <label
                  data-testid="stash-untracked-checkbox-label"
                  className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Checkbox
                    data-testid="stash-untracked-checkbox"
                    checked={includeUntracked}
                    onChange={(e) => setIncludeUntracked(e.target.checked)}
                  />
                  <span>
                    {t('stash.pushDialog.includeUntracked', {
                      defaultValue: 'Inclure les fichiers non suivis',
                    })}
                  </span>
                </label>

                <Button
                  size="sm"
                  data-testid="stash-submit-button"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={handleStash}
                  disabled={
                    isStashing ||
                    ((gitStatus?.staged?.length ?? 0) === 0 &&
                      (gitStatus?.unstaged?.length ?? 0) === 0 &&
                      (gitStatus?.untracked?.length ?? 0) === 0)
                  }
                >
                  {isStashing ? (
                    <Spinner className="mr-1.5 h-3 w-3" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                  <span>{t('stash.push', { defaultValue: 'Stash changes' })}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <CommitBatchReviewPanel review={batchReview} />
    </div>
  )
}
