import { useMemo, useState } from 'react'
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { Lock, Check, ArrowUp } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit } from '@tauri-apps/api/event'
import type { GitStatusEntry } from '@git-manager/git-types'
import { Button, ScrollArea, Spinner, Textarea } from '@git-manager/ui'
import { SplitButton, useVerticalResize } from '@git-manager/components'
import {
  apiCreateFixupCommit,
  apiGetCommitFileVsWorkdir,
  apiPushBranch,
} from '../../../api/git.api'
import { useGitStatus } from '../../../hooks/useGitStatus'
import { useTheme } from '../../../hooks/useTheme'
import { useMonacoTheme } from '../../../hooks/useMonacoTheme'
import { queryClient } from '../../../lib/queryClient'
import { ThreeWayMergeEditor } from '../../merge-editor/ThreeWayMergeEditor'
import { CommitFileList, type ProcessedFileItem } from '../components/CommitFileList'

type CommitMode = 'commit' | 'push'

interface FixupCommitWindowProps {
  repoPath: string
  targetOid: string
  targetShortOid: string
  targetSubject: string
}

/**
 * Dedicated "Commit Changes" window (own Tauri WebviewWindow, like the conflict
 * merge window) for creating a fixup! commit. Reuses `CommitFileList` for the
 * staging tree — its ✓ stage/unstage buttons decide what goes into the commit —
 * and the merge-view layout principle for the diff area. The three sections
 * (files / message / diff) are separated by draggable resize handles.
 */
function FixupCommitWindowContent({ repoPath, targetOid, targetShortOid, targetSubject }: FixupCommitWindowProps) {
  const { t } = useTranslation('git')
  const qc = useQueryClient()
  const { data: status } = useGitStatus(repoPath)

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [message, setMessage] = useState(`fixup! ${targetSubject}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filesPanel = useVerticalResize(220, 100, 500)
  const messagePanel = useVerticalResize(96, 56, 240)

  // Same construction as CommitDetailsPanel's WIP mode.
  const processedFiles = useMemo<ProcessedFileItem[]>(() => {
    if (!status) return []
    const list: ProcessedFileItem[] = []
    status.staged.forEach((f: GitStatusEntry) =>
      list.push({ path: f.path, status: f.status as ProcessedFileItem['status'], staged: true }),
    )
    status.unstaged.forEach((f: GitStatusEntry) =>
      list.push({ path: f.path, status: f.status as ProcessedFileItem['status'], staged: false }),
    )
    status.untracked.forEach((f: string) => list.push({ path: f, status: 'untracked', staged: false }))
    return list
  }, [status])

  const stagedCount = status?.staged.length ?? 0
  const activePath =
    selectedPath && processedFiles.some((f) => f.path === selectedPath)
      ? selectedPath
      : processedFiles[0]?.path ?? null

  const { data: diff, isLoading: diffLoading } = useQuery({
    queryKey: ['fixup-file-diff', repoPath, targetOid, activePath],
    queryFn: () => apiGetCommitFileVsWorkdir(repoPath, targetOid, activePath!),
    enabled: !!activePath,
  })

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['git-status', repoPath] })
  }

  async function handleCancel() {
    await getCurrentWindow().close()
  }

  /** Opens the "Rebasing Commit" editor on the target..HEAD range (replaces this window). */
  async function openRebasingWindow() {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const safeLabel = `rebase-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}-${targetShortOid}`
    const url =
      `/?window=rebase&repoPath=${encodeURIComponent(repoPath)}` +
      `&baseOid=${encodeURIComponent(targetOid)}`

    const existing = await WebviewWindow.getByLabel(safeLabel)
    if (existing) {
      await existing.show()
      await existing.setFocus()
    } else {
      new WebviewWindow(safeLabel, {
        url,
        title: `Rebasing Commit - ${targetShortOid}`,
        width: 1200,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        decorations: true,
      })
    }
  }

  async function handleCommit(mode: CommitMode) {
    setBusy(true)
    setError(null)
    try {
      await apiCreateFixupCommit(repoPath, targetOid, message)
      if (mode === 'push') {
        await apiPushBranch(repoPath)
      } else {
        // Creating the fixup! commit alone would leave it dangling on top of HEAD
        // with nothing to actually squash it into its target — the Rebasing Commit
        // editor takes over so the user finishes the job right away.
        await openRebasingWindow()
      }
      await emit('fixup-committed', { repoPath })
      await getCurrentWindow().close()
    } catch (err) {
      setError(String(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background select-none animate-fadeIn">
      {/* Header: fixup target banner */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('gitTree.fixupDialog.targetCommit')}
        </span>
        <span className="font-mono text-xs text-foreground">{targetShortOid}</span>
        <span className="truncate text-xs text-muted-foreground">{targetSubject}</span>
      </div>

      {/* Files panel (reused CommitFileList: ✓ buttons stage/unstage = include/exclude,
          folder checkboxes cascade to every file below them) */}
      <div style={{ height: filesPanel.height }} className="shrink-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-3 py-2">
            <CommitFileList
              repoPath={repoPath}
              isWip
              commitOid="WIP"
              processedFiles={processedFiles}
              onSelectFileDiff={(file) => setSelectedPath(file.path)}
              onRefresh={handleRefresh}
              hideStats
              folderCheckboxes
              cacheKey={`fixup-window:${repoPath}`}
            />
          </div>
        </ScrollArea>
      </div>

      <div
        {...filesPanel.resizeProps}
        className="h-1 shrink-0 cursor-row-resize border-y border-border/60 bg-card hover:bg-primary/30"
        data-testid="fixup-resize-files"
      />

      {/* Commit message panel */}
      <div style={{ height: messagePanel.height }} className="flex shrink-0 flex-col px-4 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('gitTree.fixupDialog.messageLabel')}
        </div>
        <Textarea
          data-testid="fixup-commit-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-0 flex-1 resize-none font-mono text-xs"
          disabled={busy}
        />
      </div>

      <div
        {...messagePanel.resizeProps}
        className="h-1 shrink-0 cursor-row-resize border-y border-border/60 bg-card hover:bg-primary/30"
        data-testid="fixup-resize-message"
      />

      {/* Diff area — the bordered container holds `ConflictResolver`'s own header (nav,
          whitespace, highlight, collapse-unchanged toggle — all "for free" from code-view) plus
          its status bar, which we feed the target sha / "Current version" pane labels below. */}
      <div className="min-h-0 flex-1 bg-card/45 p-3">
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background">
          {diffLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-5 w-5" />
            </div>
          ) : activePath && diff ? (
            <ThreeWayMergeEditor
              repoPath={repoPath}
              filePath={activePath}
              original={diff.original}
              modified={diff.modified}
              isTwoWay={true}
              defaultCollapseUnchanged
              originalLabel={
                <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground/75">
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
                  <span className="font-mono text-foreground/90">{targetShortOid}</span>
                  <span className="truncate font-mono">{activePath}</span>
                </div>
              }
              modifiedLabel={
                <span className="truncate text-muted-foreground/70">{t('gitTree.fixupDialog.currentVersion')}</span>
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t('gitTree.fixupDialog.noChanges')}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 shadow-md">
        {error && <span className="mr-auto truncate text-xs text-destructive">{error}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-[11px] font-semibold"
          onClick={handleCancel}
          disabled={busy}
          data-testid="fixup-cancel"
        >
          {t('gitTree.fixupDialog.cancel')}
        </Button>
        <SplitButton
          testIdPrefix="fixup-commit"
          busy={busy}
          disabled={stagedCount === 0 || !message.trim()}
          icon={<Check className="h-3.5 w-3.5" />}
          label={t('gitTree.fixupDialog.commit')}
          onClick={() => handleCommit('commit')}
          actions={[
            {
              key: 'push',
              label: t('gitTree.fixupDialog.commitAndPush'),
              icon: <ArrowUp className="h-3.5 w-3.5" />,
              onSelect: () => handleCommit('push'),
            },
          ]}
        />
      </div>
    </div>
  )
}

export function FixupCommitWindow(props: FixupCommitWindowProps) {
  useTheme()
  useMonacoTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <FixupCommitWindowContent {...props} />
    </QueryClientProvider>
  )
}
