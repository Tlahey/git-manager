import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { Lock } from 'lucide-react'
import { ScrollArea, Spinner } from '@git-manager/ui'
import type { GitCommit } from '@git-manager/git-types'
import { apiGetCommitDiff } from '../../../api/git.api'
import { useFileRawContents } from '../../../hooks/useFileRawContents'
import { CommitFileList, type ProcessedFileItem } from '../../git-graph/components/CommitFileList'
import { ThreeWayMergeEditor } from '../../merge-editor/ThreeWayMergeEditor'

interface RebaseCommitDetailsProps {
  repoPath: string
  commit: GitCommit
}

/**
 * Right panel of the "Rebasing Commit" editor: the selected commit's changed
 * files (reused `CommitFileList`) on top, the selected file's diff below —
 * rendered with the same `@git-manager/code-view`-backed `ThreeWayMergeEditor`
 * (two-way mode) as the fixup "Commit Changes" window, so navigation,
 * whitespace/highlight modes and the collapse-unchanged toggle all come from
 * the library's own header — then commit metadata (title, author, date) at
 * the bottom. Remounted by the parent (`key={commit.oid}`) whenever the
 * selected commit changes, so all local state resets naturally.
 */
export function RebaseCommitDetails({ repoPath, commit }: RebaseCommitDetailsProps) {
  const { t } = useTranslation('git')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const { data: diff, isLoading: filesLoading } = useQuery({
    queryKey: ['commit-diff', repoPath, commit.oid],
    queryFn: () => apiGetCommitDiff(repoPath, commit.oid),
  })

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

  const activePath =
    selectedPath && processedFiles.some((f) => f.path === selectedPath)
      ? selectedPath
      : (processedFiles[0]?.path ?? null)

  // original = the file at this commit's parent, modified = the file at this
  // commit — i.e. exactly the change this commit introduced.
  const { data: fileContents, isLoading: fileLoading } = useFileRawContents(
    repoPath,
    activePath,
    false,
    commit.oid
  )

  const parentShortOid = commit.parentOids[0]?.slice(0, 7)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Changed files */}
      <ScrollArea className="h-40 shrink-0 border-b border-border">
        <div className="p-2">
          {filesLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="h-4 w-4" />
            </div>
          ) : (
            <CommitFileList
              repoPath={repoPath}
              isWip={false}
              commitOid={commit.oid}
              processedFiles={processedFiles}
              onSelectFileDiff={(file) => setSelectedPath(file.path)}
              hideSearch
              hideStats
              cacheKey={`rebase-details:${repoPath}:${commit.oid}`}
            />
          )}
        </div>
      </ScrollArea>

      {/* Diff of the selected file — bordered container holds ConflictResolver's own header. */}
      <div className="min-h-0 flex-1 bg-card/45 p-2">
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background">
          {fileLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-5 w-5" />
            </div>
          ) : activePath && fileContents ? (
            <ThreeWayMergeEditor
              repoPath={repoPath}
              filePath={activePath}
              original={fileContents.original}
              modified={fileContents.modified}
              isTwoWay
              defaultCollapseUnchanged
              originalLabel={
                <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground/75">
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
                  <span className="font-mono text-foreground/90">
                    {parentShortOid ?? t('rebaseEditor.noParent')}
                  </span>
                </div>
              }
              modifiedLabel={
                <span className="font-mono text-muted-foreground/70">{commit.shortOid}</span>
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t('rebaseEditor.selectFileHint')}
            </div>
          )}
        </div>
      </div>

      {/* Commit metadata */}
      <ScrollArea className="h-28 shrink-0 border-t border-border">
        <div className="space-y-1.5 p-3 text-xs">
          <div className="font-semibold leading-snug text-foreground">{commit.subject}</div>
          {commit.body && (
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
              {commit.body}
            </p>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground">
            <div>
              <span className="font-medium text-foreground/80">{t('rebaseEditor.author')}</span>{' '}
              {commit.author.name} &lt;{commit.author.email}&gt;
            </div>
            <div>
              <span className="font-medium text-foreground/80">{t('rebaseEditor.date')}</span>{' '}
              {new Date(commit.author.timestamp * 1000).toLocaleString()}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground/70">{commit.oid}</div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
