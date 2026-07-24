import { useState, useMemo, useEffect } from 'react'
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
import { convertFileSrc } from '@tauri-apps/api/core'
import { ThreeWayMergeEditor } from '../merge-editor/ThreeWayMergeEditor'
import { BlameFileViewer } from './BlameFileViewer'
import { Markdown } from '../Markdown'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useFileHistory } from '../../hooks/useFileHistory'
import { DiffToolbar } from './components/DiffToolbar'

interface DiffViewCenterProps {
  repoPath: string
  file: {
    path: string
    staged: boolean
    oid?: string // defined if reviewing a historic commit
    // Set only for a merged multi-commit selection: the diff spans `baseOid^..oid` instead of
    // `oid` vs its own first parent (see the summary panel).
    baseOid?: string
    // Which tab to open on ('diff' by default); the file-lookup palette sets 'file'.
    initialTab?: 'diff' | 'file' | 'preview'
    unmodified?: boolean
  }
  onClose: () => void
  onRefresh?: () => void
}

export function DiffViewCenter({ repoPath, file, onClose, onRefresh }: DiffViewCenterProps) {
  const { t } = useTranslation('git')
  const [copied, setCopied] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const isMarkdown = Boolean(file.path && /\.(md|markdown|mdown|mkdn|mdwn)$/i.test(file.path))
  const isImage = Boolean(file.path && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(file.path))
  const hasPreview = isMarkdown || isImage
  const [activeTab, setActiveTab] = useState<'diff' | 'file' | 'preview'>(file.initialTab ?? 'diff')

  // The initializer above only runs on mount; when a different file is opened into an already-mounted
  // viewer (e.g. picking another file from the command palette) re-apply its requested initial tab.
  useEffect(() => {
    if (file.initialTab) setActiveTab(file.initialTab)
  }, [file.path, file.oid, file.initialTab])

  const activeLeftPanel = useRepoUIStore((s) => s.activeLeftPanel)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)
  const selectedHistoryOid = useRepoUIStore((s) => s.selectedHistoryOid)
  const setSelectedHistoryOid = useRepoUIStore((s) => s.setSelectedHistoryOid)
  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)
  const [shaCopied, setShaCopied] = useState(false)

  // Auto-inject the currently viewed file into the global UI store so that
  // side panels (like Blame/History) always have the correct file context,
  // regardless of which parent component (GitGraph, ProjectFilesView) rendered us.
  useEffect(() => {
    setActiveDiffFile(file)
  }, [file.path, file.staged, file.oid, file.baseOid, file.initialTab, setActiveDiffFile])

  // Commit whose version we're showing: a version picked in the History panel takes precedence over
  // the file's own review commit. Both the "Diff" tab (this commit vs its parent) and the "File" tab
  // (the file as it was at this commit) are scoped to it via the shared diff/raw-contents hooks.
  const effectiveOid = selectedHistoryOid ?? file.oid
  // The merged-range base only applies to the file's own commit; a version picked from the History
  // panel is a single historic commit, so it diffs against that commit's own parent (no range).
  const effectiveBaseOid = selectedHistoryOid ? undefined : file.baseOid

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
  } = useFileDiff(repoPath, file.path, file.staged, effectiveOid, effectiveBaseOid)

  // Use hook to fetch raw contents
  const { data: rawContents, isLoading: isLoadingRaw } = useFileRawContents(
    repoPath,
    file.path,
    file.staged,
    effectiveOid,
    effectiveBaseOid
  )

  const isLoading = isLoadingMeta || isLoadingRaw
  const isWip = !effectiveOid

  const isUnmodifiedWip = isWip && file.unmodified
  const { data: history } = useFileHistory(repoPath, isUnmodifiedWip ? file.path : null)
  const [hasAutoSelected, setHasAutoSelected] = useState(false)

  // Reset auto-select flag if we switch to a different file
  useEffect(() => {
    setHasAutoSelected(false)
  }, [file.path])

  // Automatically select the latest commit if the user tries to view an unmodified file
  useEffect(() => {
    if (isUnmodifiedWip && history && history.length > 0 && !hasAutoSelected) {
      setSelectedHistoryOid(history[0].oid)
      setHasAutoSelected(true)
    }
  }, [isUnmodifiedWip, history, hasAutoSelected, setSelectedHistoryOid])

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
        hasPreview={hasPreview}
        isImage={isImage}
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

        {!isLoading && !diffData && activeTab === 'diff' && (
          <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
            No difference data found.
          </div>
        )}

        {!isLoading && (diffData || activeTab !== 'diff') && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {diffData?.isBinary ? (
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
                {activeTab === 'preview' ? (
                  <div
                    data-testid="file-preview-area"
                    className="flex-1 overflow-y-auto bg-card/10 p-6 select-text flex items-center justify-center"
                  >
                    {isMarkdown ? (
                      <div className="w-full h-full max-w-4xl mx-auto block">
                        <Markdown content={rawContents?.modified || ''} repoPath={repoPath} />
                      </div>
                    ) : isImage ? (
                      <div className="flex flex-col items-center gap-4">
                        <img 
                          src={convertFileSrc(`${repoPath}/${file.path}`)} 
                          alt="File preview" 
                          className="max-w-full max-h-[70vh] rounded shadow-sm object-contain bg-neutral-100 dark:bg-neutral-800" 
                        />
                        {effectiveOid && (
                          <div className="text-[10px] text-muted-foreground italic">
                            Note: Preview shows current local file, not historic version.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Preview not available</div>
                    )}
                  </div>
                ) : activeTab === 'file' ? (
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
