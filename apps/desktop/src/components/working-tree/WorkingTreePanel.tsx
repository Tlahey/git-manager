import type { GitStatusEntry } from '@git-manager/git-types'
import { Button, ScrollArea, Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { DiffViewer } from '../git-graph/DiffViewer'
import { useFileDiff } from '../../hooks/useFileDiff'
import { useGitStatus } from '../../hooks/useGitStatus'
import { stageAll, stageFile, unstageAll, unstageFile } from '../../lib/tauri'
import { apiCreateCommit } from '../../api/git.api'
import { CommitMessageBox } from './CommitMessageBox'
import { FileStatusItem } from './FileStatusItem'

interface WorkingTreePanelProps {
  repoPath: string
}

interface SelectedFile {
  path: string
  staged: boolean
}

interface Notification {
  type: 'success' | 'error'
  message: string
}

export function WorkingTreePanel({ repoPath }: WorkingTreePanelProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)

  const { data: status, isLoading } = useGitStatus(repoPath)
  const { data: fileDiff, isLoading: isDiffLoading } = useFileDiff(
    repoPath,
    selectedFile?.path ?? null,
    selectedFile?.staged ?? false,
  )

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
  }

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3500)
  }

  async function handleToggleStaged(entry: GitStatusEntry | string, isCurrentlyStaged: boolean) {
    const filePath = typeof entry === 'string' ? entry : entry.path
    try {
      if (isCurrentlyStaged) {
        await unstageFile(repoPath, filePath)
      } else {
        await stageFile(repoPath, filePath)
      }
      invalidate()
      // Déselectionner si le fichier change de section
      if (selectedFile?.path === filePath) {
        setSelectedFile({ path: filePath, staged: !isCurrentlyStaged })
      }
    } catch (err) {
      showNotification('error', String(err))
    }
  }

  async function handleStageAll() {
    try {
      await stageAll(repoPath)
      invalidate()
    } catch (err) {
      showNotification('error', String(err))
    }
  }

  async function handleUnstageAll() {
    try {
      await unstageAll(repoPath)
      invalidate()
    } catch (err) {
      showNotification('error', String(err))
    }
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    try {
      const result = await apiCreateCommit(repoPath, commitMessage)
      setCommitMessage('')
      setSelectedFile(null)
      invalidate()
      showNotification('success', t('commit.success', { sha: result.shortOid }))
    } catch (err) {
      showNotification('error', String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  const stagedFiles = status?.staged ?? []
  const unstagedFiles = status?.unstaged ?? []
  const untrackedFiles = status?.untracked ?? []
  const hasChanges =
    stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Notification */}
      {notification && (
        <div
          className={`flex items-center gap-2 px-3 py-2 text-xs ${
            notification.type === 'success'
              ? 'bg-green-500/10 text-green-400'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{t('workingTree.title')}</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={handleStageAll}
            disabled={unstagedFiles.length === 0 && untrackedFiles.length === 0}
          >
            {t('workingTree.stageAll')}
          </Button>
        </div>
      </div>

      {/* Corps : liste + diff */}
      <div className="flex flex-1 overflow-hidden">
        {/* Colonne gauche : listes de fichiers + zone de commit */}
        <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border">
          <ScrollArea className="flex-1">
            {isLoading && (
              <div className="flex items-center justify-center py-6">
                <Spinner className="h-4 w-4" />
              </div>
            )}

            {!isLoading && !hasChanges && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t('workingTree.noChanges')}
              </p>
            )}

            {/* Section : Staged */}
            {stagedFiles.length > 0 && (
              <div>
                <div className="flex items-center justify-between bg-muted/30 px-2 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('workingTree.staged', { count: stagedFiles.length })}
                  </span>
                  <button
                    onClick={handleUnstageAll}
                    className="text-[10px] text-muted-foreground/70 hover:text-foreground"
                  >
                    {t('workingTree.unstageAll')}
                  </button>
                </div>
                {stagedFiles.map((entry) => (
                  <FileStatusItem
                    key={entry.path}
                    entry={entry}
                    isStaged={true}
                    isSelected={
                      selectedFile?.path === entry.path && selectedFile.staged === true
                    }
                    onClick={() => setSelectedFile({ path: entry.path, staged: true })}
                    onToggle={() => handleToggleStaged(entry, true)}
                  />
                ))}
              </div>
            )}

            {/* Section : Unstaged */}
            {unstagedFiles.length > 0 && (
              <div>
                <div className="bg-muted/30 px-2 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('workingTree.unstaged', { count: unstagedFiles.length })}
                  </span>
                </div>
                {unstagedFiles.map((entry) => (
                  <FileStatusItem
                    key={entry.path}
                    entry={entry}
                    isStaged={false}
                    isSelected={
                      selectedFile?.path === entry.path && selectedFile.staged === false
                    }
                    onClick={() => setSelectedFile({ path: entry.path, staged: false })}
                    onToggle={() => handleToggleStaged(entry, false)}
                  />
                ))}
              </div>
            )}

            {/* Section : Untracked */}
            {untrackedFiles.length > 0 && (
              <div>
                <div className="bg-muted/30 px-2 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('workingTree.untracked', { count: untrackedFiles.length })}
                  </span>
                </div>
                {untrackedFiles.map((filePath) => (
                  <FileStatusItem
                    key={filePath}
                    entry={filePath}
                    isUntracked={true}
                    isStaged={false}
                    isSelected={
                      selectedFile?.path === filePath && selectedFile.staged === false
                    }
                    onClick={() => setSelectedFile({ path: filePath, staged: false })}
                    onToggle={() => handleToggleStaged(filePath, false)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Zone de commit en bas */}
          <CommitMessageBox
            repoPath={repoPath}
            message={commitMessage}
            onChange={setCommitMessage}
            onCommit={handleCommit}
            isCommitting={isCommitting}
            hasStagedFiles={stagedFiles.length > 0}
          />
        </div>

        {/* Colonne droite : diff */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedFile && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-xs text-muted-foreground">{t('workingTree.selectFile')}</p>
            </div>
          )}

          {selectedFile && (
            <ScrollArea className="flex-1">
              <div className="p-2">
                {isDiffLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Spinner className="h-4 w-4" />
                  </div>
                )}
                {!isDiffLoading && fileDiff && <DiffViewer file={fileDiff} />}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  )
}
