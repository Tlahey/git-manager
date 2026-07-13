import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { useFileDiff } from '../../hooks/useFileDiff'
import { useFileRawContents } from '../../hooks/useFileRawContents'
import { apiDiscardFileChanges, apiStageFile, apiUnstageFile } from '../../api/git.api'
import { ThreeWayMergeEditor } from '../merge-editor/ThreeWayMergeEditor'
import { MonacoFileViewer } from './MonacoFileViewer'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { DiffToolbar } from './components/DiffToolbar'

interface DiffViewCenterProps {
  repoPath: string
  file: {
    path: string
    staged: boolean
    oid?: string // defined if reviewing a historic commit
  }
  onClose: () => void
  onRefresh?: () => void
}

export function DiffViewCenter({ repoPath, file, onClose, onRefresh }: DiffViewCenterProps) {
  const { t } = useTranslation('git')
  const [copied, setCopied] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'diff' | 'file'>('diff')

  const activeLeftPanel = useRepoUIStore((s) => s.activeLeftPanel)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)

  // Use hook to fetch diff metadata
  const {
    data: diffData,
    isLoading: isLoadingMeta,
    refetch,
  } = useFileDiff(repoPath, file.path, file.staged, file.oid)

  // Use hook to fetch raw contents
  const { data: rawContents, isLoading: isLoadingRaw } = useFileRawContents(
    repoPath,
    file.path,
    file.staged,
    file.oid
  )

  const isLoading = isLoadingMeta || isLoadingRaw
  const isWip = !file.oid

  const displayPath = useMemo(() => {
    if (!diffData) return file.path
    return diffData.status === 'renamed'
      ? `${diffData.oldPath} → ${diffData.newPath}`
      : diffData.newPath || diffData.oldPath
  }, [diffData, file.path])

  const parsedPath = useMemo(() => {
    const lastSlash = displayPath.lastIndexOf('/')
    if (lastSlash === -1) {
      return { dir: '', name: displayPath }
    }
    const dir = displayPath.substring(0, lastSlash + 1)
    const name = displayPath.substring(lastSlash + 1)
    return { dir, name }
  }, [displayPath])

  async function handleCopyPath() {
    await navigator.clipboard.writeText(file.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Toggle stage / unstage
  async function handleToggleStage() {
    setIsProcessing(true)
    try {
      if (file.staged) {
        await apiUnstageFile(repoPath, file.path)
      } else {
        await apiStageFile(repoPath, file.path)
      }
      refetch()
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsProcessing(false)
    }
  }

  // Rollback file changes
  async function handleRollback() {
    const ok = window.confirm(t('commitDetails.discardPrompt'))
    if (ok) {
      setIsProcessing(true)
      try {
        await apiDiscardFileChanges(repoPath, file.path)
        onClose()
        onRefresh?.()
      } catch (err) {
        alert(String(err))
      } finally {
        setIsProcessing(false)
      }
    }
  }

  return (
    <div className="animate-in fade-in zoom-in-95 flex h-full w-full select-none flex-col overflow-hidden bg-background duration-100">
      <DiffToolbar
        parsedPath={parsedPath}
        diffData={diffData}
        file={file}
        isWip={isWip}
        copied={copied}
        onCopyPath={handleCopyPath}
        onClose={onClose}
        activeTab={activeTab}
        onChangeActiveTab={setActiveTab}
        activeLeftPanel={activeLeftPanel}
        onChangeActiveLeftPanel={setActiveLeftPanel}
        isProcessing={isProcessing}
        onToggleStage={handleToggleStage}
        onRollback={handleRollback}
      />

      {/* ── DIFF CONTENT AREA ─────────────────────────────────────────────────── */}
      <div
        data-testid="diff-content-area"
        className="flex flex-1 select-text flex-col overflow-hidden bg-card/45 font-mono text-xs"
      >
        {isLoading && (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner className="mr-2 h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">Loading diff…</span>
          </div>
        )}

        {!isLoading && !diffData && (
          <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
            No difference data found.
          </div>
        )}

        {!isLoading && diffData && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {diffData.isBinary ? (
              <div
                data-testid="diff-binary-placeholder"
                className="rounded-lg border border-border bg-muted/20 px-4 py-8 text-center italic text-muted-foreground"
              >
                Binary file diff content cannot be displayed.
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-background">
                {activeTab === 'file' ? (
                  <MonacoFileViewer content={rawContents?.modified || ''} filePath={file.path} />
                ) : (
                  <ThreeWayMergeEditor
                    repoPath={repoPath}
                    filePath={file.path}
                    original={rawContents?.original || ''}
                    modified={rawContents?.modified || ''}
                    isTwoWay
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
