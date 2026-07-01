import { useMemo } from 'react'
import { ScrollArea } from '@git-manager/ui'
import { useCommitDiff } from '../../hooks/useCommitDiff'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import type { GitGraphNode } from '@git-manager/git-types'

import { CommitHeaderInfo } from './components/CommitHeaderInfo'
import { useReposStore } from '../../stores/repos.store'
import { CommitFileList } from './components/CommitFileList'
import type { ProcessedFileItem } from './components/CommitFileList'
import { WipStagingPanel } from './components/WipStagingPanel'

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
  onClose
}: CommitDetailsPanelProps) {
  const queryClient = useQueryClient()
  const { commit } = node
  const isWip = commit.oid === 'WIP'

  const { data: gitStatus } = useGitStatus(repoPath)
  const { data: diff } = useCommitDiff(
    repoPath,
    isWip ? '' : commit.oid
  )

  const isHead = isHeadProp ?? node.refs.some((r) => r.type === 'HEAD')

  const repoCache = useReposStore((s) => s.repoCache)
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

  const processedFiles = useMemo<ProcessedFileItem[]>(() => {
    if (isWip) {
      if (!gitStatus) return []
      const list: ProcessedFileItem[] = []
      gitStatus.staged.forEach((f: any) =>
        list.push({
          path: f.path,
          status: f.status as any,
          staged: true
        })
      )
      gitStatus.unstaged.forEach((f: any) =>
        list.push({
          path: f.path,
          status: f.status as any,
          staged: false
        })
      )
      gitStatus.untracked.forEach((f: string) =>
        list.push({
          path: f,
          status: 'untracked',
          staged: false
        })
      )
      return list
    }
    return (diff?.files ?? []).map((f) => ({
      path: f.newPath || f.oldPath,
      status: f.status as any,
      additions: f.additions,
      deletions: f.deletions,
      staged: false
    }))
  }, [isWip, diff, gitStatus])

  const isStash = node.refs.some((r) => r.type === 'stash')

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card shadow-2xl min-w-0">
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
      <style dangerouslySetInnerHTML={{ __html: `
        .details-scroll-area [data-radix-scroll-area-viewport] > div {
          display: block !important;
          width: 100% !important;
        }
      `}} />
      <ScrollArea className="flex-1 min-w-0 w-full details-scroll-area">
        <div className="px-4 py-4 space-y-4 min-w-0 w-full overflow-hidden">
          <CommitFileList
            repoPath={repoPath}
            isWip={isWip}
            commitOid={commit.oid}
            processedFiles={processedFiles}
            onSelectFileDiff={onSelectFileDiff}
            onRefresh={handleRefresh}
          />
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
