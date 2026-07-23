import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Textarea, Spinner, Tag, cn } from '@git-manager/ui'
import {
  Copy,
  Check,
  GitCommit,
  Layers,
  Pencil,
  X,
  Github,
  Gitlab,
  GitMerge,
  GitPullRequest,
} from 'lucide-react'
import { CommitDetailsAvatar } from './CommitDetailsAvatar'
import { apiOpenUrl } from '../../../api/shell.api'
import type { GitGraphNode, GitRef } from '@git-manager/git-types'
import { useGitStashes } from '../../../hooks/useGitStashes'
import { useCommitMessageEdit } from '../../../hooks/useCommitMessageEdit'
import { useCommitPullRequest } from '../../../hooks/useCommitPullRequest'

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface CommitHeaderInfoProps {
  isWip: boolean
  isStash?: boolean
  commit: GitGraphNode['commit']
  isHead: boolean
  repoPath: string
  remoteUrl: string | null
  onSelectCommit?: (oid: string) => void
  onRefresh?: () => void
  onClose?: () => void
  refs?: GitRef[]
  /** Branch the working tree is on (null when detached) — shown as "WIP on <branch>". WIP only. */
  wipBranch?: string | null
  /** Total number of changed files in the working tree — shown next to a "WIP" tag. WIP only. */
  wipFileCount?: number
}

export function CommitHeaderInfo({
  isWip,
  isStash = false,
  commit,
  isHead,
  repoPath,
  remoteUrl,
  onSelectCommit,
  onRefresh,
  onClose,
  refs = [],
  wipBranch,
  wipFileCount,
}: CommitHeaderInfoProps) {
  const { t } = useTranslation('git')

  const { data: stashes } = useGitStashes(repoPath)
  const stash = useMemo(() => {
    if (!isStash) return null
    return stashes?.find((s) => s.commitOid === commit?.oid)
  }, [isStash, stashes, commit?.oid])

  // The GitHub pull request this commit belongs to (the one that merged it), if any.
  const commitPr = useCommitPullRequest(repoPath, isWip || isStash ? null : commit.oid)

  const {
    copied,
    handleCopySha,
    isEditingMessage,
    setIsEditingMessage,
    editSubject,
    setEditSubject,
    editBody,
    setEditBody,
    isSavingMessage,
    handleUpdateCommitMessage,
  } = useCommitMessageEdit({ commit, repoPath, isStash, stash, refs, onRefresh })

  const messageBodyParsed = useMemo(() => {
    if (!commit.body) return null
    const lines = commit.body.split('\n')
    return lines.map((line, idx) => {
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return (
          <li key={idx} className="ml-4 list-disc pl-1 leading-relaxed text-muted-foreground/90">
            {line.trim().substring(1).trim()}
          </li>
        )
      }
      return (
        <p key={idx} className="min-h-[1.2em] leading-relaxed text-muted-foreground">
          {line}
        </p>
      )
    })
  }, [commit.body])

  const parentOids = commit.parentOids ?? []

  return (
    <div className="space-y-4">
      {/* PANEL HEADER */}
      <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isWip ? (
              <>
                <Layers className="h-3.5 w-3.5 text-primary" />
                {wipBranch
                  ? t('workingTree.onBranch', { branch: wipBranch })
                  : t('workingTree.title')}
              </>
            ) : isStash ? (
              <>
                <Layers className="h-3.5 w-3.5 text-violet-400" />
                {t('stash.title')}
              </>
            ) : (
              <>
                <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
                {t('commitDetails.title')}
              </>
            )}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {onClose && (
              <button
                onClick={onClose}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t('actions.close')}
                data-testid="commit-details-close-button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {isWip && wipFileCount !== undefined && (
          <div className="flex items-center gap-1.5" data-testid="wip-file-count">
            <Tag tone="warning" className="px-1.5 py-0.5 text-[9px]">
              WIP
            </Tag>
            <span className="text-[11px] font-medium text-muted-foreground">
              {t('workingTree.filesChanged', { count: wipFileCount })}
            </span>
          </div>
        )}

        {!isWip && (
          <div className="mt-1 flex items-center gap-2.5 border-t border-border/20 pt-2">
            <CommitDetailsAvatar name={commit.author.name} email={commit.author.email} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-semibold text-foreground">
                {commit.author.name}
              </span>
              <span className="truncate text-[10px] text-muted-foreground/80">
                &lt;{commit.author.email}&gt;
              </span>
              <span className="mt-0.5 text-[9px] font-medium text-muted-foreground/60">
                {formatDate(commit.author.timestamp)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* COMMIT MESSAGE BOX & METADATA */}
      <div className="space-y-4 px-4">
        {!isWip &&
          (isEditingMessage ? (
            <div
              data-testid="commit-amend-form"
              className="space-y-3 rounded-lg border border-border bg-muted/5 p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Subject
                  </span>
                  <span
                    data-testid="commit-subject-counter"
                    className={cn(
                      'font-mono text-[10px]',
                      72 - editSubject.length < 10
                        ? 'font-bold text-destructive'
                        : 'text-muted-foreground'
                    )}
                  >
                    {72 - editSubject.length} chars remaining
                  </span>
                </div>
                <Input
                  data-testid="commit-subject-input"
                  autoFocus
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  maxLength={72}
                  placeholder="Commit subject..."
                  className="h-8 font-mono text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Description
                </span>
                <Textarea
                  data-testid="commit-body-textarea"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Commit description (optional)..."
                  rows={4}
                  className="resize-none font-mono text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  data-testid="commit-amend-submit"
                  size="sm"
                  className="h-8 flex-1 text-xs font-semibold"
                  onClick={handleUpdateCommitMessage}
                  disabled={!editSubject.trim() || isSavingMessage}
                >
                  {isSavingMessage ? <Spinner className="mr-1.5 h-3 w-3" /> : null}
                  {t('commitDetails.updateMessage')}
                </Button>
                <Button
                  data-testid="commit-amend-cancel"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-xs font-semibold"
                  onClick={() => setIsEditingMessage(false)}
                  disabled={isSavingMessage}
                >
                  {t('commitDetails.cancelAmend')}
                </Button>
              </div>
            </div>
          ) : isHead ? (
            <div
              data-testid="commit-message-clickable"
              role="button"
              tabIndex={0}
              onClick={() => setIsEditingMessage(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setIsEditingMessage(true)
              }}
              className="group cursor-pointer space-y-2 rounded-lg border border-border/30 bg-muted/15 p-3 transition-all hover:border-primary/50 hover:bg-accent/15"
              title="Click to edit commit message (amend)"
            >
              <div className="flex items-start justify-between gap-2">
                <h4
                  data-testid="commit-subject-display"
                  className="flex-1 break-words text-xs font-bold leading-snug text-foreground"
                >
                  {commit.subject}
                </h4>
                <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground/60" />
              </div>
              {commit.body && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-border/20 pt-1 text-[11px] font-normal">
                  {messageBodyParsed}
                </div>
              )}
            </div>
          ) : isStash ? (
            <div
              data-testid="commit-message-clickable"
              role="button"
              tabIndex={0}
              onClick={() => setIsEditingMessage(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setIsEditingMessage(true)
              }}
              className="group cursor-pointer space-y-2 rounded-lg border border-border/30 bg-muted/15 p-3 transition-all hover:border-primary/50 hover:bg-accent/15"
              title={t('commitHeaderInfo.editStashMessage')}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="flex-1 break-words text-xs font-bold leading-snug text-foreground">
                  {stash ? stash.message.split('\n\n')[0] : commit.subject}
                </h4>
                <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground/60" />
              </div>
              {stash && stash.message.split('\n\n')[1] ? (
                <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-border/20 pt-1 text-[11px] font-normal text-muted-foreground">
                  {stash.message.split('\n\n').slice(1).join('\n\n')}
                </div>
              ) : commit.body ? (
                <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-border/20 pt-1 text-[11px] font-normal">
                  {messageBodyParsed}
                </div>
              ) : null}
            </div>
          ) : (
            <div
              data-testid="commit-message-readonly"
              role="button"
              tabIndex={0}
              onClick={() => setIsEditingMessage(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setIsEditingMessage(true)
              }}
              className="group cursor-pointer space-y-2 rounded-lg border border-border/30 bg-muted/15 p-3 transition-all hover:border-primary/50 hover:bg-accent/15"
              title={t('commitHeaderInfo.editCommitMessage')}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="flex-1 break-words text-xs font-bold leading-snug text-foreground">
                  {commit.subject}
                </h4>
                <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground/60" />
              </div>
              {commit.body && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-border/20 pt-1 text-[11px] font-normal">
                  {messageBodyParsed}
                </div>
              )}
            </div>
          ))}

        {!isWip && (
          <div className="space-y-2.5 border-t border-border/20 pt-1">
            {/* SHA */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('commitDetails.sha') || 'SHA'}:
              </span>
              <div className="flex items-center gap-1 rounded border border-border/40 bg-muted/65 p-0.5">
                <code
                  className="max-w-[200px] select-all truncate px-1 font-mono text-[10px] font-semibold text-foreground"
                  title={commit.oid}
                >
                  {commit.oid}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 transition-colors hover:bg-accent/80"
                  onClick={handleCopySha}
                  title={t('gitTree.detailPanel.copy')}
                >
                  {copied ? (
                    <Check className="h-2 w-2 shrink-0 text-green-500" />
                  ) : (
                    <Copy className="h-2 w-2 shrink-0 text-muted-foreground" />
                  )}
                </Button>
              </div>

              {remoteUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex h-7 shrink-0 items-center gap-1.5 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => apiOpenUrl(`${remoteUrl}/commit/${commit.oid}`)}
                  title={
                    remoteUrl.includes('gitlab.com')
                      ? 'Open commit on GitLab'
                      : 'Open commit on GitHub'
                  }
                  data-testid="github-commit-link"
                >
                  {remoteUrl.includes('gitlab.com') ? (
                    <Gitlab className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Github className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{remoteUrl.includes('gitlab.com') ? 'GitLab' : 'GitHub'}</span>
                </Button>
              )}
            </div>

            {/* Associated pull request (the one that merged this commit), if any */}
            {commitPr && (
              <button
                onClick={() => apiOpenUrl(commitPr.url)}
                className="flex w-full items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-left transition-colors hover:border-primary/45 hover:bg-accent/40"
                data-testid="commit-pr-label"
                title={t('commitDetails.openPullRequest', { number: commitPr.number })}
              >
                <Github className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {commitPr.merged ? (
                  <GitMerge className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                ) : (
                  <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
                <span className="shrink-0 font-mono text-[11px] font-bold text-foreground">
                  #{commitPr.number}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {commitPr.title}
                </span>
              </button>
            )}

            {/* Parents */}
            {parentOids.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('commitDetails.parents') || 'Parents'}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {parentOids.map((p) => (
                    <button
                      key={p}
                      onClick={() => onSelectCommit?.(p)}
                      className="rounded border border-border bg-accent/60 px-2 py-0.5 font-mono text-[10px] font-semibold transition-all hover:border-primary/45 hover:bg-primary/15 hover:text-primary"
                    >
                      {p.substring(0, 7)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
