import { useTranslation } from '@git-manager/i18n'
import { Button, Textarea, Badge, cn } from '@git-manager/ui'
import {
  ChevronDown,
  Layers,
  Sparkles,
  Check,
  History,
  Square,
} from 'lucide-react'
import type { GitStatus } from '@git-manager/git-types'
import { useWipCommitPanel } from '../../../hooks/useWipCommitPanel'
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

  const {
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
    history,
    historyOpen,
    setHistoryOpen,
  } = useWipCommitPanel(repoPath, gitStatus, allWipChanges, t, onRefresh)

  const statusIcons: Record<string, string> = {
    added: 'text-green-500 font-bold text-[10px]',
    modified: 'text-yellow-500 font-bold text-[10px]',
    deleted: 'text-red-500 font-bold text-[10px]',
    renamed: 'text-blue-500 font-bold text-[10px]',
    untracked: 'text-muted-foreground font-bold text-[10px]'
  }

  const statusLetters: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?'
  }

  return (
    <div className="pt-2 border-t border-border/55 space-y-3 px-4 pb-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setBatchMode((b) => !b)}
          className="flex items-center gap-1.5 text-xs text-primary font-bold hover:opacity-85 select-none"
        >
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>
            {batchMode
              ? '← Retour au commit global'
              : t('commitDetails.batchCommit.title')}
          </span>
        </button>
      </div>

      {batchMode ? (
        /* Smart Batch Mode */
        <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="text-[10px] text-muted-foreground font-medium leading-relaxed pb-1 border-b border-border/20">
            {t('commitDetails.batchCommit.subtitle')}
          </p>

          {Object.keys(wipBatches).map((groupName) => {
            const files = wipBatches[groupName]
            const msg = batchMessages[groupName] ?? ''
            const isGen = batchGenerating[groupName]

            return (
              <div
                key={groupName}
                className="border border-border/40 bg-muted/10 rounded-lg p-3 space-y-2.5"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary font-mono truncate">
                    /{groupName}
                  </span>
                  <Badge variant="secondary" className="text-[9px] font-bold">
                    {files.length} file(s)
                  </Badge>
                </div>

                {/* Files in Group */}
                <div className="max-h-24 overflow-y-auto border border-border/30 rounded p-1.5 bg-card space-y-0.5">
                  {files.map((file) => (
                    <div key={file.path} className="flex items-center justify-between text-[10px] py-0.5 font-mono w-full min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-4">
                        <span className={cn(statusIcons[file.status], "shrink-0 min-w-[12px] text-center select-none")}>
                          {statusLetters[file.status]}
                        </span>
                        {(() => {
                          const lastSlash = file.path.lastIndexOf('/')
                          if (lastSlash === -1) return null
                          const dir = file.path.substring(0, lastSlash + 1)
                          return (
                            <span className="text-muted-foreground/45 truncate min-w-0 shrink pr-0.5 text-[9px] leading-tight select-text">
                              {dir}
                            </span>
                          )
                        })()}
                      </div>
                      <span className="text-foreground font-semibold shrink-0 truncate min-w-0 text-[9px] leading-tight select-all">
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
                    value={msg}
                    onChange={(e) =>
                      setBatchMessages((prev) => ({
                        ...prev,
                        [groupName]: e.target.value
                      }))
                    }
                    placeholder={t('commitDetails.batchCommit.placeholder')}
                    rows={2}
                    className="resize-none text-[11px] font-mono"
                    disabled={isGen}
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-[10px] font-semibold gap-1"
                      onClick={() => generateMessageForBatch(groupName, files)}
                      disabled={isGen}
                    >
                      {isGen ? (
                        <Spinner className="h-2.5 w-2.5" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-primary" />
                      )}
                      <span>
                        {isGen
                          ? t('commitDetails.batchCommit.generating')
                          : t('commit.generate')}
                      </span>
                    </Button>

                    <Button
                      size="sm"
                      className="flex-1 h-7 text-[10px] font-semibold gap-1"
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
        /* Classic Staged / Unstaged List + Commit message */
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              {t('commit.title')}
            </span>
            <Textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder={t('commit.placeholder')}
              rows={3}
              className="resize-none font-mono text-xs"
              disabled={isGenerating}
            />
          </div>

          <div className="flex gap-2">
            <div className="relative flex flex-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1 rounded-r-none text-xs border-r-0 h-8"
                onClick={handleGenerateCommitMessage}
                disabled={gitStatus?.staged?.length === 0 && !isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Square className="h-3 w-3 text-destructive animate-pulse" />
                    {t('commit.stop')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 text-primary" />
                    {t('commit.generate')}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-7 rounded-l-none px-0 text-xs"
                onClick={() => setHistoryOpen((v) => !v)}
                disabled={isGenerating}
                title={t('commit.history')}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>

              {historyOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-1.5 w-full min-w-[220px] rounded-lg border border-border bg-background shadow-xl p-1 animate-in fade-in duration-100">
                  <div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
                    <History className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t('commit.history')}
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {history.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground/70 italic">
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
                          className="w-full truncate px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors font-mono"
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
              className="flex-1 text-xs h-8"
              onClick={handleCommitWip}
              disabled={
                (gitStatus?.staged?.length ?? 0) === 0 ||
                !commitMessage.trim() ||
                isCommitting
              }
            >
              {isCommitting ? <Spinner className="mr-1.5 h-3 w-3" /> : null}
              {t('commit.commit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin h-3 w-3 text-current", className)} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
