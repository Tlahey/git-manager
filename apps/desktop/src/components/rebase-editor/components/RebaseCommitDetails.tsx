import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea, Spinner, Separator } from '@git-manager/ui'
import type { GitCommit } from '@git-manager/git-types'
import { apiGetCommitDiff } from '../../../api/git.api'
import { CommitFileList, type ProcessedFileItem } from '../../git-graph/components/CommitFileList'

interface RebaseCommitDetailsProps {
  repoPath: string
  commit: GitCommit
}

/**
 * Right panel of the "Rebasing Commit" editor: the selected commit's file
 * changes (reused `CommitFileList`) with its metadata below (subject, author,
 * date, sha, body).
 */
export function RebaseCommitDetails({ repoPath, commit }: RebaseCommitDetailsProps) {
  const { t } = useTranslation('git')

  const { data: diff, isLoading } = useQuery({
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
    [diff],
  )

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <CommitFileList
            repoPath={repoPath}
            isWip={false}
            commitOid={commit.oid}
            processedFiles={processedFiles}
            hideSearch
            cacheKey={`rebase-details:${repoPath}:${commit.oid}`}
          />
        )}

        <Separator />

        {/* Commit metadata */}
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold leading-snug text-foreground">{commit.subject}</div>
          {commit.body && (
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{commit.body}</p>
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
      </div>
    </ScrollArea>
  )
}
