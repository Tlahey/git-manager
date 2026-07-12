import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea } from '@git-manager/ui'
import { useCommitDiff } from '../../hooks/useCommitDiff'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import type { GitGraphNode, GitStatusEntry } from '@git-manager/git-types'

import { CommitHeaderInfo } from './components/CommitHeaderInfo'
import { useRepoDataStore } from '../../stores/repoData.store'
import { CommitFileList } from './components/CommitFileList'
import type { ProcessedFileItem } from './components/CommitFileList'
import { WipStagingPanel } from './components/WipStagingPanel'
import { apiStageAll, apiUnstageAll } from '../../api/git.api'

interface CommitDetailsPanelProps {
  node: GitGraphNode
  repoPath: string
  isHead?: boolean
  onSelectCommit?: (oid: string) => void
  onSelectFileDiff?: (file: { path: string; staged: boolean; oid?: string }) => void
  onClose?: () => void
}

export function CommitDetailsPanel({
  node,
  repoPath,
  isHead: isHeadProp,
  onSelectCommit,
  onSelectFileDiff,
  onClose,
}: CommitDetailsPanelProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { commit } = node
  const isWip = commit.oid === 'WIP'

  const { data: gitStatus } = useGitStatus(repoPath)
  const { data: diff } = useCommitDiff(repoPath, isWip ? '' : commit.oid)

  const isHead = isHeadProp ?? node.refs.some((r) => r.type === 'HEAD')

  const repoCache = useRepoDataStore((s) => s.repoCache)
  const cachedRepo = repoCache[repoPath]

  const remoteUrl = useMemo(() => {
    if (!cachedRepo?.remotes) return null
    const remotes = cachedRepo.remotes
    const origin = remotes.find((r) => r.includes('github.com') || r.includes('gitlab.com'))
    if (!origin) return null
    let url = origin.replace(/\.git$/, '')
    if (url.startsWith('git@')) {
      url = 'https://' + url.substring(4).replace(':', '/')
    }
    return url
  }, [cachedRepo])

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    mutate(['git-stashes', repoPath])
  }

  async function handleStageAll() {
    await apiStageAll(repoPath)
    handleRefresh()
  }

  async function handleUnstageAll() {
    await apiUnstageAll(repoPath)
    handleRefresh()
  }

  const processedFiles = useMemo<ProcessedFileItem[]>(() => {
    if (isWip) {
      if (!gitStatus) return []
      const list: ProcessedFileItem[] = []
      gitStatus.staged.forEach((f: GitStatusEntry) =>
        list.push({
          path: f.path,
          status: f.status as ProcessedFileItem['status'],
          staged: true,
        })
      )
      gitStatus.unstaged.forEach((f: GitStatusEntry) =>
        list.push({
          path: f.path,
          status: f.status as ProcessedFileItem['status'],
          staged: false,
        })
      )
      gitStatus.untracked.forEach((f: string) =>
        list.push({
          path: f,
          status: 'untracked',
          staged: false,
        })
      )
      return list
    }
    return (diff?.files ?? []).map((f) => ({
      path: f.newPath || f.oldPath,
      status: f.status as ProcessedFileItem['status'],
      additions: f.additions,
      deletions: f.deletions,
      staged: false,
    }))
  }, [isWip, diff, gitStatus])

  const unmergedFiles = useMemo<ProcessedFileItem[]>(() => {
    if (!isWip || !gitStatus) return []
    return gitStatus.conflicted.map((path) => ({
      path,
      status: 'conflicted' as const,
      staged: false,
    }))
  }, [isWip, gitStatus])

  const stagedFiles = useMemo(() => processedFiles.filter((f) => f.staged), [processedFiles])
  const unstagedFiles = useMemo(() => processedFiles.filter((f) => !f.staged), [processedFiles])

  const isStash = node.refs.some((r) => r.type === 'stash')

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl">
      {/* ── HEADER ── */}
      <CommitHeaderInfo
        isWip={isWip}
        isStash={isStash}
        commit={commit}
        isHead={isHead}
        repoPath={repoPath}
        remoteUrl={remoteUrl}
        onSelectCommit={onSelectCommit}
        onRefresh={handleRefresh}
        onClose={onClose}
        refs={node.refs}
      />

      {/* ── SCROLLABLE FILE LIST ── */}
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
          {isWip ? (
            <>
              {unmergedFiles.length > 0 && (
                <CommitFileList
                  repoPath={repoPath}
                  isWip={false}
                  commitOid={commit.oid}
                  processedFiles={unmergedFiles}
                  onSelectFileDiff={onSelectFileDiff}
                  onRefresh={handleRefresh}
                  title={t('workingTree.unmerged', { count: unmergedFiles.length })}
                  hideStats
                  hideSearch
                  collapsible
                  cacheKey={`${repoPath}:${commit.oid}:unmerged`}
                />
              )}
              <CommitFileList
                repoPath={repoPath}
                isWip
                commitOid={commit.oid}
                processedFiles={stagedFiles}
                onSelectFileDiff={onSelectFileDiff}
                onRefresh={handleRefresh}
                title={t('workingTree.staged', { count: stagedFiles.length })}
                hideStats
                hideSearch
                collapsible
                hoverStage="remove"
                onBulkStage={handleUnstageAll}
                cacheKey={`${repoPath}:${commit.oid}:staged`}
              />
              <CommitFileList
                repoPath={repoPath}
                isWip
                commitOid={commit.oid}
                processedFiles={unstagedFiles}
                onSelectFileDiff={onSelectFileDiff}
                onRefresh={handleRefresh}
                title={t('workingTree.unstaged', { count: unstagedFiles.length })}
                hideStats
                hideSearch
                collapsible
                hoverStage="add"
                onBulkStage={handleStageAll}
                cacheKey={`${repoPath}:${commit.oid}:unstaged`}
              />
            </>
          ) : (
            <CommitFileList
              repoPath={repoPath}
              isWip={false}
              commitOid={commit.oid}
              processedFiles={processedFiles}
              onSelectFileDiff={onSelectFileDiff}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </ScrollArea>

      {/* ── WIP ONLY STAGING & COMMIT PANELS ── */}
      {isWip && (
        <WipStagingPanel
          repoPath={repoPath}
          gitStatus={gitStatus}
          allWipChanges={processedFiles}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}
