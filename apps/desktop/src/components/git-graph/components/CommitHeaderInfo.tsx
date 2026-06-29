import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Textarea, cn } from '@git-manager/ui'
import {
  Copy,
  Check,
  ExternalLink,
  GitCommit,
  Layers,
  Pencil,
  X,
} from 'lucide-react'
import { CommitDetailsAvatar } from './CommitDetailsAvatar'
import { apiCreateCommit } from '../../../api/git.api'
import type { GitGraphNode } from '@git-manager/git-types'

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

interface CommitHeaderInfoProps {
  isWip: boolean
  commit: GitGraphNode['commit']
  isHead: boolean
  repoPath: string
  remoteUrl: string | null
  onSelectCommit?: (oid: string) => void
  onRefresh?: () => void
  onClose?: () => void
}

export function CommitHeaderInfo({
  isWip,
  commit,
  isHead,
  repoPath,
  remoteUrl,
  onSelectCommit,
  onRefresh,
  onClose,
}: CommitHeaderInfoProps) {
  const { t } = useTranslation('git')

  const [copied, setCopied] = useState(false)
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [isSavingMessage, setIsSavingMessage] = useState(false)

  // Reset states when the selected commit changes
  useEffect(() => {
    setIsEditingMessage(false)
    setEditSubject(commit?.subject ?? '')
    setEditBody(commit?.body ?? '')
  }, [commit?.oid, commit?.subject, commit?.body])

  async function handleUpdateCommitMessage() {
    if (!editSubject.trim()) return
    setIsSavingMessage(true)
    try {
      const fullMessage = editBody.trim()
        ? `${editSubject.trim()}\n\n${editBody.trim()}`
        : editSubject.trim()

      const commitOidToAmend = commit.oid !== 'WIP' ? commit.oid : undefined
      await apiCreateCommit(repoPath, fullMessage, true, commitOidToAmend)
      setIsEditingMessage(false)
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsSavingMessage(false)
    }
  }

  async function handleCopySha() {
    await navigator.clipboard.writeText(commit.oid)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const messageBodyParsed = useMemo(() => {
    if (!commit.body) return null
    const lines = commit.body.split('\n')
    return lines.map((line, idx) => {
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return (
          <li key={idx} className="ml-4 list-disc text-muted-foreground/90 pl-1 leading-relaxed">
            {line.trim().substring(1).trim()}
          </li>
        )
      }
      return (
        <p key={idx} className="text-muted-foreground leading-relaxed min-h-[1.2em]">
          {line}
        </p>
      )
    })
  }, [commit.body])

  const parentOids = commit.parentOids ?? []

  return (
    <div className="space-y-4">
      {/* PANEL HEADER */}
      <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {isWip ? (
              <>
                <Layers className="h-3.5 w-3.5 text-primary" />
                {t('workingTree.title')}
              </>
            ) : (
              <>
                <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
                {t('commitDetails.title')}
              </>
            )}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {!isWip && (
          <div className="flex items-center gap-2.5 mt-1 border-t border-border/20 pt-2">
            <CommitDetailsAvatar name={commit.author.name} email={commit.author.email} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">
                {commit.author.name}
              </span>
              <span className="text-[10px] text-muted-foreground/80 truncate">
                &lt;{commit.author.email}&gt;
              </span>
              <span className="text-[9px] text-muted-foreground/60 mt-0.5 font-medium">
                {formatDate(commit.author.timestamp)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* COMMIT MESSAGE BOX & METADATA */}
      <div className="px-4 space-y-4">
        {!isWip && (
          isEditingMessage ? (
            <div data-testid="commit-amend-form" className="border border-border bg-muted/5 rounded-lg p-3 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Subject
                  </span>
                  <span
                    data-testid="commit-subject-counter"
                    className={cn(
                      "text-[10px] font-mono",
                      72 - editSubject.length < 10 ? "text-destructive font-bold" : "text-muted-foreground"
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
                  className="text-xs font-mono font-bold h-8"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Description
                </span>
                <Textarea
                  data-testid="commit-body-textarea"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Commit description (optional)..."
                  rows={4}
                  className="resize-none text-xs font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  data-testid="commit-amend-submit"
                  size="sm"
                  className="flex-1 text-xs h-8 font-semibold"
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
                  className="flex-1 text-xs h-8 font-semibold"
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
              className="bg-muted/15 border border-border/30 hover:border-primary/50 hover:bg-accent/15 cursor-pointer rounded-lg p-3 space-y-2 group transition-all"
              title="Click to edit commit message (amend)"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 data-testid="commit-subject-display" className="text-xs font-bold text-foreground leading-snug break-words flex-1">
                  {commit.subject}
                </h4>
                <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 mt-0.5 transition-all duration-200" />
              </div>
              {commit.body && (
                <div className="text-[11px] space-y-1.5 pt-1 border-t border-border/20 font-normal">
                  {messageBodyParsed}
                </div>
              )}
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
              className="bg-muted/15 border border-border/30 hover:border-primary/50 hover:bg-accent/15 cursor-pointer rounded-lg p-3 space-y-2 group transition-all"
              title="Click to edit commit message"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-bold text-foreground leading-snug break-words flex-1">
                  {commit.subject}
                </h4>
                <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 mt-0.5 transition-all duration-200" />
              </div>
              {commit.body && (
                <div className="text-[11px] space-y-1.5 pt-1 border-t border-border/20 font-normal">
                  {messageBodyParsed}
                </div>
              )}
            </div>
          )
        )}

        {!isWip && (
          <div className="space-y-2.5 pt-1 border-t border-border/20">
            {/* SHA */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('commitDetails.sha') || 'SHA'}:
              </span>
              <div className="flex items-center gap-1 bg-muted/65 p-0.5 rounded border border-border/40">
                <code className="text-[10px] font-mono text-foreground font-semibold px-1 select-all truncate max-w-[200px]" title={commit.oid}>
                  {commit.oid}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-accent/80 transition-colors"
                  onClick={handleCopySha}
                  title={t('gitTree.detailPanel.copy')}
                >
                  {copied ? (
                    <Check className="h-2 w-2 text-green-500 shrink-0" />
                  ) : (
                    <Copy className="h-2 w-2 text-muted-foreground shrink-0" />
                  )}
                </Button>
              </div>

              {remoteUrl && (
                <a
                  href={`${remoteUrl}/commit/${commit.oid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline transition-all font-semibold shrink-0"
                >
                  <span>GitHub</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>

            {/* Parents */}
            {parentOids.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                  {t('commitDetails.parents') || 'Parents'}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {parentOids.map((p) => (
                    <button
                      key={p}
                      onClick={() => onSelectCommit?.(p)}
                      className="text-[10px] font-mono bg-accent/60 hover:bg-primary/15 hover:text-primary hover:border-primary/45 border border-border px-2 py-0.5 rounded transition-all font-semibold"
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

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin h-3 w-3 text-current", className)} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
