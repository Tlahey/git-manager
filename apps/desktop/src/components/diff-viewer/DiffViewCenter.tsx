import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner, Button, toast, GithubIcon, cn } from '@git-manager/ui'
import { Copy, Check as CheckIcon, GitPullRequest, Tags } from 'lucide-react'
import { useFileDiff } from '../../hooks/useFileDiff'
import { useFileRawContents } from '../../hooks/useFileRawContents'
import { useFileHistory } from '../../hooks/useFileHistory'
import { useCommitTag } from '../../hooks/useCommitTag'
import { useCommitPullRequest } from '../../hooks/useCommitPullRequest'
import { useRepoGitHub } from '../../hooks/useRepoGitHub'
import { apiGetCommitWebUrl } from '../../api/git.api'
import { apiOpenUrl } from '../../api/shell.api'
import { resolveTagOrReleaseUrl } from '../../api/github.api'
import { toAssetUrl, joinRepoPath } from '../../lib/assetUrl'
import { shortOid } from '../../lib/shortOid'
import { ThreeWayMergeEditor } from '../merge-editor/ThreeWayMergeEditor'
import { BlameFileViewer } from './BlameFileViewer'
import { Markdown } from '../Markdown'
import { useRepoUIStore, type ActiveDiffFile } from '../../stores/repoUI.store'
import { DiffToolbar } from './DiffToolbar'
import { ChangeExplanationPanel } from './ChangeExplanationPanel'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { hasPreviewTab, isPreviewableImage, isPreviewableMarkdown } from './previewableFile'
import { splitPath } from '../../lib/filePath'

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
}

export function DiffViewCenter({ repoPath, file, onClose }: DiffViewCenterProps) {
  const { t } = useTranslation('git')
  const [copied, setCopied] = useState(false)
  const isMarkdown = isPreviewableMarkdown(file.path)
  const isImage = isPreviewableImage(file.path)
  const hasPreview = hasPreviewTab(file.path)
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
  // Our parents rebuild the `file` prop on every render, so the store is keyed on its *contents*:
  // re-publishing on identity alone would loop through the store update it triggers.
  const activeDiffFile = useMemo<ActiveDiffFile>(
    () => ({
      path: file.path,
      staged: file.staged,
      oid: file.oid,
      baseOid: file.baseOid,
      initialTab: file.initialTab,
      unmodified: file.unmodified,
    }),
    [file.path, file.staged, file.oid, file.baseOid, file.initialTab, file.unmodified]
  )

  useEffect(() => {
    setActiveDiffFile(activeDiffFile)
  }, [activeDiffFile, setActiveDiffFile])

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

  const isWip = !effectiveOid
  // A file opened from the explorer that has no pending change: there is nothing to diff its
  // working copy against, since the working copy *is* HEAD.
  const isUnmodifiedWip = isWip && file.unmodified

  // What "the diff" can only mean for such a file: the change that produced the version on
  // screen, i.e. the last commit that touched it. Resolved locally and used for the data hooks
  // alone — writing it into the shared `selectedHistoryOid` would hijack the History panel's own
  // selection and leave a "Back to current" button that returns here.
  const { data: unmodifiedHistory } = useFileHistory(repoPath, isUnmodifiedWip ? file.path : null)
  const lastChangeOid = isUnmodifiedWip ? unmodifiedHistory?.[0]?.oid : undefined
  const showingLastChange = isUnmodifiedWip && !!lastChangeOid
  // `modified` at that commit is byte-identical to the working copy (the file is unmodified), so
  // the File tab reads the same content either way — only the `original` side gains a real
  // counterpart to compare against.
  const contentOid = effectiveOid ?? lastChangeOid

  // Use hook to fetch diff metadata
  const {
    data: diffData,
    isLoading: isLoadingMeta,
    isPlaceholderData: isStaleMeta,
  } = useFileDiff(repoPath, file.path, file.staged, contentOid, effectiveBaseOid)

  // Use hook to fetch raw contents
  const {
    data: rawContents,
    isLoading: isLoadingRaw,
    isPlaceholderData: isStaleRaw,
  } = useFileRawContents(repoPath, file.path, file.staged, contentOid, effectiveBaseOid)

  // Only true on the very first open: both hooks keep the previous file's data while the next one
  // loads, which is what stops the editor being torn down and rebuilt on every file switch.
  const isLoading = isLoadingMeta || isLoadingRaw
  // Showing the previous file's contents while the new ones arrive — worth saying quietly, not
  // worth replacing the view for.
  const isStale = isStaleMeta || isStaleRaw
  const aiEnabled = useAiEnabled()

  // Image previews are read off disk through the asset protocol: a file that was deleted, renamed,
  // or lives outside the granted scope resolves to a broken `<img>` unless the failure is caught.
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [file.path])
  const workingCopyUrl = useMemo(
    () => (isImage ? toAssetUrl(joinRepoPath(repoPath, file.path)) : ''),
    [isImage, repoPath, file.path]
  )

  const displayPath = useMemo(() => {
    if (!diffData) return file.path
    return diffData.status === 'renamed'
      ? `${diffData.oldPath} → ${diffData.newPath}`
      : diffData.newPath || diffData.oldPath
  }, [diffData, file.path])

  const parsedPath = useMemo(() => splitPath(displayPath), [displayPath])

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

  return (
    <div className="flex h-full w-full animate-in flex-col overflow-hidden bg-background select-none zoom-in-95 animate-duration-100 fade-in">
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
        hasPreview={hasPreview}
      />

      {/* ── DIFF CONTENT AREA ─────────────────────────────────────────────────── */}
      <div
        data-testid="diff-content-area"
        data-stale={isStale ? 'true' : undefined}
        className={cn(
          'flex flex-1 flex-col overflow-hidden bg-card/45 font-mono text-xs select-text',
          // Switching files keeps the previous contents on screen for the moment the next ones
          // take to arrive (see useFileRawContents). Dimmed rather than replaced: tearing the
          // editor down and rebuilding it is exactly the flicker this avoids.
          isStale && 'opacity-60 transition-opacity duration-100'
        )}
      >
        {isLoading && (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner className="mr-2 h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">{t('diffView.loading')}</span>
          </div>
        )}

        {!isLoading && !diffData && activeTab === 'diff' && (
          <div
            className="flex h-40 w-full items-center justify-center text-muted-foreground"
            data-testid="diff-no-data"
          >
            {isUnmodifiedWip ? t('diffView.noPendingChanges') : t('diffView.noDiffData')}
          </div>
        )}

        {!isLoading && (diffData || activeTab !== 'diff') && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {diffData?.isBinary ? (
              <div
                data-testid="diff-binary-placeholder"
                className="border border-border bg-muted/20 px-4 py-8 text-center text-muted-foreground italic"
              >
                Binary file diff content cannot be displayed.
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden border border-border/80 bg-background">
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
                        aria-label={t('fileHistory.copySha')}
                        className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary transition-colors hover:bg-accent"
                      >
                        {shortOid(effectiveOid)}
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
                        aria-label={t('fileHistory.openOnGithub')}
                      >
                        <GithubIcon className="h-3.5 w-3.5" />
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
                {/* No pending change, so the Diff tab is showing the commit that last touched the
                    file rather than nothing at all. Said explicitly: without it the tab silently
                    shows a diff the user never asked for. */}
                {showingLastChange && activeTab === 'diff' && (
                  <div
                    data-testid="diff-last-change-note"
                    className="shrink-0 border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground"
                  >
                    {t('diffView.showingLastChange', { sha: shortOid(lastChangeOid) })}
                  </div>
                )}
                {/* AI reading of the pending change, above the diff itself. Scoped to the working
                    copy: "explain the changes in progress" is a question about work the user is
                    still shaping, not about a commit that already has a message — which is exactly
                    what `showingLastChange` is, so it is excluded too. */}
                {aiEnabled && isWip && !showingLastChange && activeTab === 'diff' && diffData && (
                  <ChangeExplanationPanel
                    repoPath={repoPath}
                    diffData={diffData}
                    fileContent={rawContents?.modified}
                  />
                )}
                {activeTab === 'preview' ? (
                  <div
                    data-testid="file-preview-area"
                    className="flex flex-1 items-center justify-center overflow-y-auto bg-card/10 p-6 select-text"
                  >
                    {isMarkdown ? (
                      <div className="mx-auto block h-full w-full max-w-4xl">
                        <Markdown content={rawContents?.modified || ''} repoPath={repoPath} />
                      </div>
                    ) : isImage ? (
                      <div className="flex flex-col items-center gap-4">
                        {imageFailed ? (
                          <div
                            className="rounded-lg border border-border bg-muted/20 px-4 py-8 text-center text-muted-foreground italic"
                            data-testid="file-preview-image-error"
                          >
                            {t('diffView.previewImageUnavailable')}
                          </div>
                        ) : (
                          <img
                            src={workingCopyUrl}
                            alt={t('diffView.previewImageAlt', { path: file.path })}
                            onError={() => setImageFailed(true)}
                            className="max-h-[70vh] max-w-full rounded bg-muted object-contain shadow-xs"
                            data-testid="file-preview-image"
                          />
                        )}
                        {/* The image always comes off disk: git blobs aren't served over `asset:`, so
                            a historic version can't be rendered and the caveat has to be explicit. */}
                        {effectiveOid && !imageFailed && (
                          <div className="text-[10px] text-muted-foreground italic">
                            {t('diffView.previewWorkingCopyNote')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">
                        {t('diffView.previewUnavailable')}
                      </div>
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
