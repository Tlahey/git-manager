import { useTranslation } from '@git-manager/i18n'
import { Button, Textarea, Badge, Spinner, cn, Checkbox, Tooltip } from '@git-manager/ui'
import {
  ChevronDown,
  Layers,
  Sparkles,
  Check,
  History,
  Square,
  Wand2,
  AlertTriangle,
  GitCommitHorizontal,
  Archive,
} from 'lucide-react'
import type { GitStatus } from '@git-manager/git-types'
import { useWipCommitPanel } from '../../../hooks/useWipCommitPanel'
import { useCommitBatchReview } from '../../../hooks/useCommitBatchReview'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import { CommitBatchReviewDialog } from './CommitBatchReviewDialog'
import { PrPublishButton } from '../pr/PrPublishButton'
import type { ProcessedFileItem } from './CommitFileList'

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
    commitMessage,
    setCommitMessage,
    isCommitting,
    handleCommitWip,
    handleGenerateCommitMessage,
    isGenerating,
    commitValidation,
    history,
    historyOpen,
    setHistoryOpen,
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
          className="flex select-none items-center gap-1.5 text-xs font-bold text-primary hover:opacity-85"
        >
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>
            {batchMode ? '← Retour au commit global' : t('commitDetails.batchCommit.title')}
          </span>
        </button>
      </div>

      {batchMode ? (
        /* Smart Batch Mode */
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 pt-1 duration-150">
          <p className="border-b border-border/20 pb-1 text-[10px] font-medium leading-relaxed text-muted-foreground">
            {t('commitDetails.batchCommit.subtitle')}
          </p>

          {Object.keys(wipBatches).map((groupName) => {
            const files = wipBatches[groupName]
            const msg = batchMessages[groupName] ?? ''
            const isGen = batchGenerating[groupName]

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
                    {files.length} file(s)
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
                        disabled={isGen}
                      >
                        {isGen ? (
                          <Spinner className="h-2.5 w-2.5" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-primary" />
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
                      disabled={isGen || !msg.trim()}
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
                  'flex items-center gap-1.5 rounded-t-md px-2.5 py-1 text-xs font-semibold transition-colors',
                  activeTab === 'commit'
                    ? 'border border-b-0 border-border/60 bg-card text-foreground shadow-xs'
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
                  'flex items-center gap-1.5 rounded-t-md px-2.5 py-1 text-xs font-semibold transition-colors',
                  activeTab === 'stash'
                    ? 'border border-b-0 border-border/60 bg-card text-foreground shadow-xs'
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
          <div className="space-y-3 rounded-b-lg rounded-tr-lg border border-border/40 bg-card p-3 shadow-sm">
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
                <div className="relative flex flex-1">
                  {aiEnabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="commit-generate-button"
                      className="h-8 flex-1 gap-1 rounded-r-none border-r-0 text-xs"
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
                          <Sparkles className="h-3 w-3 text-primary" />
                          {t('commit.generate')}
                        </>
                      )}
                    </Button>
                  )}
                  {/* History dropdown */}
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="commit-history-button"
                    className={
                      aiEnabled
                        ? 'h-8 w-7 rounded-l-none px-0 text-xs'
                        : 'h-8 flex-1 gap-1.5 text-xs'
                    }
                    onClick={() => setHistoryOpen((v) => !v)}
                    disabled={isGenerating}
                    title={t('commit.history')}
                  >
                    {!aiEnabled && <History className="h-3 w-3" />}
                    {!aiEnabled && <span>{t('commit.history')}</span>}
                    <ChevronDown className="h-3 w-3" />
                  </Button>

                  {historyOpen && (
                    <div className="animate-in fade-in absolute bottom-full left-0 z-popover mb-1.5 w-full min-w-[220px] rounded-lg border border-border bg-background p-1 shadow-xl duration-100">
                      <div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
                        <History className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t('commit.history')}
                        </span>
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {history.length === 0 ? (
                          <p className="px-3 py-2 text-xs italic text-muted-foreground/70">
                            {t('commit.historyEmpty')}
                          </p>
                        ) : (
                          history.map((msg, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setCommitMessage(msg)
                                setHistoryOpen(false)
                              }}
                              className="w-full truncate px-3 py-1.5 text-left font-mono text-xs text-foreground transition-colors hover:bg-accent"
                            >
                              {msg}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  size="sm"
                  data-testid="commit-button"
                  className="h-8 flex-1 text-xs"
                  onClick={handleCommitWip}
                  disabled={
                    ((gitStatus?.staged?.length ?? 0) === 0 && !isAmend) ||
                    !commitMessage.trim() ||
                    isCommitting
                  }
                >
                  {isCommitting ? <Spinner className="mr-1.5 h-3 w-3" /> : null}
                  {isAmend
                    ? t('commit.amend', { defaultValue: 'Amend' })
                    : t('commit.commit')}
                </Button>
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
                  <Wand2 className="h-3.5 w-3.5 text-primary" />
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

      <CommitBatchReviewDialog review={batchReview} />
    </div>
  )
}

