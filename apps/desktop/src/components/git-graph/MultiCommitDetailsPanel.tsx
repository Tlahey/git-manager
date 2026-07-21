import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea } from '@git-manager/ui'
import { GitCommit, Layers, X } from 'lucide-react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useCommitsMergedDiff } from '../../hooks/useCommitsMergedDiff'
import { CommitDetailsAvatar } from './components/CommitDetailsAvatar'
import { CommitFileList } from './components/CommitFileList'
import type { ProcessedFileItem } from './components/CommitFileList'
import type { ActiveDiffFile } from '../../stores/repoUI.store'

interface MultiCommitDetailsPanelProps {
  /** The selected real commits, ordered newest-first (as they appear in the graph). */
  nodes: GitGraphNode[]
  repoPath: string
  onSelectFileDiff?: (file: ActiveDiffFile) => void
  onClose?: () => void
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MultiCommitDetailsPanel({
  nodes,
  repoPath,
  onSelectFileDiff,
  onClose,
}: MultiCommitDetailsPanelProps) {
  const { t } = useTranslation('git')

  // Newest is first in graph order, oldest is last. The merged diff spans `baseOid^..headOid`.
  const headOid = nodes[0]?.commit.oid ?? null
  const baseOid = nodes[nodes.length - 1]?.commit.oid ?? null

  const { data: diff, isLoading } = useCommitsMergedDiff(repoPath, baseOid, headOid)

  const processedFiles = useMemo<ProcessedFileItem[]>(
    () =>
      (diff?.files ?? []).map((f) => ({
        path: f.newPath || f.oldPath,
        status: f.status as ProcessedFileItem['status'],
        additions: f.additions,
        deletions: f.deletions,
        staged: false,
      })),
    [diff]
  )

  const count = nodes.length

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl">
      {/* ── HEADER ── */}
      <div
        data-testid="multi-commit-panel-header"
        className="flex flex-col gap-2 border-b border-border bg-muted/20 px-4 py-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            {t('multiCommit.selectedCount', { count })}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t('actions.close')}
              data-testid="multi-commit-panel-close-button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p
          className="truncate text-[11px] text-muted-foreground/80"
          title={t('multiCommit.mergedDiffOf', { count })}
        >
          {t('multiCommit.mergedDiffOf', { count })}
        </p>
      </div>

      {/* Radix ScrollArea's viewport wraps content in a `display:table` div that sizes to its
          content — which defeats `truncate`/`w-full` inside. Force it to a full-width block so the
          commit rows are constrained to the panel and their subjects can ellipsis. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .details-scroll-area [data-radix-scroll-area-viewport] > div {
          display: block !important;
          width: 100% !important;
        }
      `,
        }}
      />
      <ScrollArea className="details-scroll-area w-full min-w-0 flex-1">
        <div className="w-full min-w-0 space-y-4 overflow-hidden px-4 py-4">
          {/* ── SELECTED COMMIT LIST (like the history list) ── */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <GitCommit className="h-3 w-3 text-emerald-400" />
              {t('multiCommit.commitsTitle')}
            </span>
            <div
              data-testid="multi-commit-list"
              className="max-h-64 divide-y divide-border/30 overflow-y-auto rounded-lg border border-border/40"
            >
              {nodes.map((node) => {
                const { commit } = node
                return (
                  <div
                    key={commit.oid}
                    className="flex w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-left"
                    data-testid={`multi-commit-row-${commit.oid}`}
                    title={commit.subject}
                  >
                    <CommitDetailsAvatar name={commit.author.name} email={commit.author.email} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {commit.subject}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground/70">
                        {commit.author.name} · {formatShortDate(commit.author.timestamp)}
                      </span>
                    </div>
                    <code className="shrink-0 rounded border border-border/40 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                      {commit.shortOid}
                    </code>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── MERGED FILE LIST (list or tree) ── */}
          {isLoading ? (
            <p className="px-1 py-2 text-[11px] italic text-muted-foreground/70">
              {t('gitTree.loading')}
            </p>
          ) : (
            <CommitFileList
              repoPath={repoPath}
              isWip={false}
              commitOid={headOid ?? ''}
              processedFiles={processedFiles}
              // Inject the range base so the center diff spans the whole selection, not just the
              // newest commit vs its own parent.
              onSelectFileDiff={(file) =>
                onSelectFileDiff?.({ ...file, baseOid: baseOid ?? undefined })
              }
              cacheKey={`${repoPath}:${baseOid}..${headOid}:merged`}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
