import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner, Button, toast } from '@git-manager/ui'
import { Copy, Check as CheckIcon, Github, GitPullRequest, Tags } from 'lucide-react'
import { useFileDiff } from '../../hooks/useFileDiff'
import { useFileRawContents } from '../../hooks/useFileRawContents'
import { useCommitTag } from '../../hooks/useCommitTag'
import { useCommitPullRequest } from '../../hooks/useCommitPullRequest'
import { useRepoGitHub } from '../../hooks/useRepoGitHub'
import {
  apiDiscardFileChanges,
  apiStageFile,
  apiUnstageFile,
  apiGetCommitWebUrl,
} from '../../api/git.api'
import { apiOpenUrl } from '../../api/shell.api'
import { resolveTagOrReleaseUrl } from '../../api/github.api'
import { ThreeWayMergeEditor } from '../merge-editor/ThreeWayMergeEditor'
import { BlameFileViewer } from './BlameFileViewer'
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
  const selectedHistoryOid = useRepoUIStore((s) => s.selectedHistoryOid)
  const setSelectedHistoryOid = useRepoUIStore((s) => s.setSelectedHistoryOid)
  const [shaCopied, setShaCopied] = useState(false)

  // Commit whose version we're showing: a version picked in the History panel takes precedence over
  // the file's own review commit. Both the "Diff" tab (this commit vs its parent) and the "File" tab
  // (the file as it was at this commit) are scoped to it via the shared diff/raw-contents hooks.
  const effectiveOid = selectedHistoryOid ?? file.oid

  // GitHub associations for the version on screen: the PR that introduced it and the tag/release it
  // shipped in. Buttons appear only once resolved (and only for GitHub repos).
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const commitPr = useCommitPullRequest(repoPath, effectiveOid ?? null)
  const commitTag = useCommitTag(repoPath, effectiveOid ?? null)

  // Use hook to fetch diff metadata
  const {
    data: diffData,
    isLoading: isLoadingMeta,
    refetch,
  } = useFileDiff(repoPath, file.path, file.staged, effectiveOid)

  // Use hook to fetch raw contents
  const { data: rawContents, isLoading: isLoadingRaw } = useFileRawContents(
    repoPath,
    file.path,
    file.staged,
    effectiveOid
  )

  const isLoading = isLoadingMeta || isLoadingRaw
  const isWip = !effectiveOid

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

  // Copy the full SHA of the version currently on screen.
  async function handleCopySha() {
    if (!effectiveOid) return
    await navigator.clipboard.writeText(effectiveOid)
    setShaCopied(true)
    setTimeout(() => setShaCopied(false), 1500)
  }

  // Open the version's commit on GitHub (resolved from the repo's remote).
  async function handleOpenOnGithub() {
    if (!effectiveOid) return
    try {
      const url = await apiGetCommitWebUrl(repoPath, effectiveOid)
      if (!url) {
        toast.error(t('gitTree.contextMenu.noRemoteLink'))
        return
      }
      await apiOpenUrl(url)
    } catch (err) {
      toast.error(String(err))
    }
  }

  // Open the commit's associated pull request on GitHub.
  async function handleOpenPr() {
    if (!commitPr) return
    try {
      await apiOpenUrl(commitPr.url)
    } catch (err) {
      toast.error(String(err))
    }
  }

  // Open the tag/release the commit shipped in (release page if it exists, else the tag).
  async function handleOpenTag() {
    if (!commitTag || !ownerRepo) return
    try {
      const url = await resolveTagOrReleaseUrl(
        ownerRepo.owner,
        ownerRepo.repo,
        commitTag,
        token ?? undefined
      )
      await apiOpenUrl(url)
    } catch (err) {
      toast.error(String(err))
    }
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
                {/* SHA bar for the version on screen: click the SHA to copy it, or open it on GitHub. */}
                {effectiveOid && (
                  <div
                    data-testid="diff-version-bar"
                    className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[11px]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {selectedHistoryOid && (
                        <span className="shrink-0 text-muted-foreground">
                          {t('fileHistory.viewingVersion')}
                        </span>
                      )}
                      <button
                        data-testid="diff-version-sha"
                        onClick={handleCopySha}
                        title={t('fileHistory.copySha')}
                        className="flex shrink-0 items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary transition-colors hover:bg-accent"
                      >
                        {effectiveOid.slice(0, 7)}
                        {shaCopied ? (
                          <CheckIcon className="h-3 w-3 text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-70" />
                        )}
                      </button>
                      <Button
                        data-testid="diff-version-github"
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                        onClick={handleOpenOnGithub}
                        title={t('fileHistory.openOnGithub')}
                      >
                        <Github className="h-3.5 w-3.5" />
                        <span>GitHub</span>
                      </Button>
                      {commitPr && (
                        <Button
                          data-testid="diff-version-pr"
                          variant="ghost"
                          size="sm"
                          className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                          onClick={handleOpenPr}
                          title={commitPr.title}
                        >
                          <GitPullRequest className="h-3.5 w-3.5" />
                          <span>#{commitPr.number}</span>
                        </Button>
                      )}
                      {commitTag && (
                        <Button
                          data-testid="diff-version-tag"
                          variant="ghost"
                          size="sm"
                          className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                          onClick={handleOpenTag}
                          title={t('fileHistory.openOnGithub')}
                        >
                          <Tags className="h-3.5 w-3.5" />
                          <span className="max-w-[120px] truncate">{commitTag}</span>
                        </Button>
                      )}
                    </div>
                    {selectedHistoryOid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-[10px] font-bold"
                        onClick={() => setSelectedHistoryOid(null)}
                      >
                        {t('fileHistory.backToCurrent')}
                      </Button>
                    )}
                  </div>
                )}
                {activeTab === 'file' ? (
                  <BlameFileViewer
                    repoPath={repoPath}
                    filePath={file.path}
                    content={rawContents?.modified || ''}
                    oid={effectiveOid}
                    showBlame={activeLeftPanel === 'blame'}
                  />
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
