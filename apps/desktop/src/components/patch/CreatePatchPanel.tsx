import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea, Spinner, toast } from '@git-manager/ui'
import type { GitStatusEntry } from '@git-manager/git-types'
import { useGitStatus } from '../../hooks/useGitStatus'
import { apiCreateWorkingPatch, apiStageAll, apiUnstageAll } from '../../api/git.api'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { CommitFileList, type ProcessedFileItem } from '../git-graph/components/CommitFileList'

/**
 * Right-panel for creating a patch from the working tree. Reuses the two-zone
 * staged/unstaged `CommitFileList` from the WIP panel: the **Patch** zone (staged)
 * is what the `.patch` will contain, the **Files** zone (unstaged/untracked) holds
 * the rest — the hover +/- moves files between them. Selecting a row shows its diff
 * in the center.
 */
export function CreatePatchPanel({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { data: status } = useGitStatus(repoPath)
  const setActiveFile = usePatchWorkspaceStore((s) => s.setActiveFile)
  const close = usePatchWorkspaceStore((s) => s.close)
  const [saving, setSaving] = useState(false)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
  }

  const stagedFiles = useMemo<ProcessedFileItem[]>(
    () =>
      (status?.staged ?? []).map((f: GitStatusEntry) => ({
        path: f.path,
        status: f.status as ProcessedFileItem['status'],
        staged: true,
      })),
    [status]
  )
  const unstagedFiles = useMemo<ProcessedFileItem[]>(() => {
    if (!status) return []
    const list: ProcessedFileItem[] = status.unstaged.map((f: GitStatusEntry) => ({
      path: f.path,
      status: f.status as ProcessedFileItem['status'],
      staged: false,
    }))
    for (const p of status.untracked) list.push({ path: p, status: 'untracked', staged: false })
    return list
  }, [status])

  const selectFile = (file: { path: string }) => setActiveFile({ path: file.path })

  async function handleStageAll() {
    await apiStageAll(repoPath)
    refresh()
  }
  async function handleUnstageAll() {
    await apiUnstageAll(repoPath)
    refresh()
  }

  async function handleCreate() {
    const paths = stagedFiles.map((f) => f.path)
    if (paths.length === 0) return
    setSaving(true)
    try {
      const destPath = await save({ defaultPath: 'changes.patch' })
      if (!destPath) return
      await apiCreateWorkingPatch(repoPath, paths, destPath)
      toast.success(t('patch.create.saved'))
      close()
    } catch (err) {
      toast.error(t('patch.create.error'), { description: String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <style
        dangerouslySetInnerHTML={{
          __html: `.patch-scroll-area [data-radix-scroll-area-viewport] > div { display:block !important; width:100% !important; }`,
        }}
      />
      <ScrollArea className="patch-scroll-area w-full min-w-0 flex-1">
        <div className="w-full min-w-0 space-y-4 px-4 py-4">
          <CommitFileList
            repoPath={repoPath}
            isWip
            commitOid="WIP"
            processedFiles={stagedFiles}
            onSelectFileDiff={selectFile}
            onRefresh={refresh}
            title={t('patch.zone.patch', { count: stagedFiles.length })}
            hideStats
            hideSearch
            collapsible
            hoverStage="remove"
            onBulkStage={handleUnstageAll}
            bulkStageTestId="patch-zone-unstage-all"
            cacheKey={`${repoPath}:patch:staged`}
          />
          <CommitFileList
            repoPath={repoPath}
            isWip
            commitOid="WIP"
            processedFiles={unstagedFiles}
            onSelectFileDiff={selectFile}
            onRefresh={refresh}
            title={t('patch.zone.files', { count: unstagedFiles.length })}
            hideStats
            hideSearch
            collapsible
            hoverStage="add"
            onBulkStage={handleStageAll}
            bulkStageTestId="patch-zone-stage-all"
            cacheKey={`${repoPath}:patch:unstaged`}
          />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-2">
        <Button
          className="w-full"
          size="sm"
          onClick={handleCreate}
          disabled={stagedFiles.length === 0 || saving}
          data-testid="patch-create-confirm"
        >
          {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
          {t('patch.create.confirm')}
        </Button>
      </div>
    </div>
  )
}
