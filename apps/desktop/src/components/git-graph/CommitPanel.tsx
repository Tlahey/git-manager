import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea, Button } from '@git-manager/ui'
import { Copy, Check, ChevronDown, ChevronRight, RotateCcw, SkipBack } from 'lucide-react'
import { useCommitDiff } from '../../hooks/useCommitDiff'
import { DiffViewer } from './DiffViewer'
import { RevertDialog } from '../rollback/RevertDialog'
import { ResetDialog } from '../rollback/ResetDialog'
import { useSettingsStore } from '../../stores/settings.store'
import type { GitGraphNode } from '@git-manager/git-types'

interface CommitPanelProps {
  node: GitGraphNode
  repoPath: string
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CommitPanel({ node, repoPath }: CommitPanelProps) {
  const { t } = useTranslation('git')
  const { commit } = node
  const [copied, setCopied] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [revertOpen, setRevertOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const protectedBranches = useSettingsStore((s) => s.settings.git.protectedBranches)

  const { data: diff, isLoading } = useCommitDiff(repoPath, commit.oid)

  async function handleCopySha() {
    await navigator.clipboard.writeText(commit.oid)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function toggleFile(filePath: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        {/* SHA */}
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground">
            {commit.shortOid}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleCopySha}
            title={t('gitTree.detailPanel.copy')}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Auteur + date */}
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{commit.author.name}</span>
          {' '}
          <span className="opacity-70">&lt;{commit.author.email}&gt;</span>
          <div className="mt-0.5 opacity-60">{formatDate(commit.author.timestamp)}</div>
        </div>

        {/* Message complet */}
        <p className="text-xs font-medium text-foreground leading-relaxed break-words">
          {commit.subject}
        </p>
        {commit.body && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {commit.body}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 flex-wrap pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setRevertOpen(true)}
          >
            <RotateCcw className="h-3 w-3" />
            {t('gitTree.actions.revert')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setResetOpen(true)}
          >
            <SkipBack className="h-3 w-3" />
            {t('gitTree.actions.reset')}
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <RevertDialog
        repoPath={repoPath}
        commitOid={commit.oid}
        commitSubject={commit.subject}
        open={revertOpen}
        onClose={() => setRevertOpen(false)}
        onSuccess={() => {}}
      />
      <ResetDialog
        repoPath={repoPath}
        targetOid={commit.oid}
        targetSubject={commit.subject}
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onSuccess={() => setResetOpen(false)}
        protectedBranches={protectedBranches}
      />

      {/* Diff */}
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-1">
          {isLoading && (
            <p className="text-xs text-muted-foreground px-1">Loading diff…</p>
          )}

          {diff && (
            <>
              {/* Résumé */}
              <p className="text-xs text-muted-foreground px-1 pb-1">
                {t('gitTree.detailPanel.filesChanged', { count: diff.files.length })}
                {' — '}
                <span className="text-green-400">+{diff.totalAdditions}</span>
                {' '}
                <span className="text-red-400">-{diff.totalDeletions}</span>
              </p>

              {/* Liste des fichiers */}
              {diff.files.map((file) => {
                const key = file.newPath || file.oldPath
                const isExpanded = expandedFiles.has(key)
                return (
                  <div key={key}>
                    {/* Ligne fichier (clickable) */}
                    <button
                      onClick={() => toggleFile(key)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-accent transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate text-foreground font-mono">
                        {file.newPath || file.oldPath}
                      </span>
                      <span className="text-green-400 shrink-0">+{file.additions}</span>
                      <span className="text-red-400 shrink-0 ml-1">-{file.deletions}</span>
                    </button>

                    {/* Diff expandé */}
                    {isExpanded && (
                      <div className="mt-1 mb-2 ml-2">
                        <DiffViewer file={file} />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
