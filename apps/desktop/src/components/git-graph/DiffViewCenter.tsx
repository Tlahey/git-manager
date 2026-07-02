import { useState, useMemo, useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Badge, Spinner, cn } from '@git-manager/ui'
import {
  X,
  ChevronLeft,
  Columns,
  List,
  RotateCcw,
  Plus,
  Minus,
  Copy,
  Check as CheckedIcon,
  ChevronUp,
  ChevronDown,
  GitCompare,
  FileText,
  Eye,
  History
} from 'lucide-react'
import { useFileDiff } from '../../hooks/useFileDiff'
import { useFileRawContents } from '../../hooks/useFileRawContents'
import { stageFile, unstageFile } from '../../lib/tauri'
import { apiDiscardFileChanges } from '../../api/git.api'
import { MonacoDiffViewer, type MonacoDiffViewerRef } from './MonacoDiffViewer'
import { useReposStore } from '../../stores/repos.store'

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



export function DiffViewCenter({
  repoPath,
  file,
  onClose,
  onRefresh
}: DiffViewCenterProps) {
  const { t } = useTranslation('git')
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('split')
  const [copied, setCopied] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'diff' | 'file'>('diff')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const diffViewerRef = useRef<MonacoDiffViewerRef>(null)

  const activeLeftPanel = useReposStore((s) => s.activeLeftPanel)
  const setActiveLeftPanel = useReposStore((s) => s.setActiveLeftPanel)

  const handlePrevChange = () => {
    diffViewerRef.current?.goToPreviousChange()
  }

  const handleNextChange = () => {
    diffViewerRef.current?.goToNextChange()
  }

  // Use hook to fetch diff metadata
  const { data: diffData, isLoading: isLoadingMeta, refetch } = useFileDiff(
    repoPath,
    file.path,
    file.staged,
    file.oid
  )

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
        await unstageFile(repoPath, file.path)
      } else {
        await stageFile(repoPath, file.path)
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

  const STATUS_LABELS: Record<string, string> = {
    added: 'Added',
    modified: 'Modified',
    deleted: 'Deleted',
    renamed: 'Renamed',
    copied: 'Copied',
    typechange: 'Typechange',
    untracked: 'Untracked'
  }

  const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
    added: 'success',
    modified: 'secondary',
    deleted: 'destructive',
    renamed: 'warning',
    copied: 'success',
    typechange: 'secondary',
    untracked: 'secondary'
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-background overflow-hidden animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {/* ── CENTRAL DIFF BANNER/HEADER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0 shadow-sm">
        {/* Left Side: Back button + File info */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-accent shrink-0"
            onClick={onClose}
            title="Back to graph"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex flex-col min-w-0">
            {parsedPath.dir && (
              <span data-testid="diff-header-path" className="font-mono text-[10px] text-muted-foreground/60 truncate select-none leading-none mb-0.5">
                {parsedPath.dir}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span data-testid="diff-header-name" className="font-mono text-xs text-foreground truncate select-all leading-tight">
                {parsedPath.name}
              </span>
              <Button
                data-testid="diff-copy-path-btn"
                variant="ghost"
                size="icon"
                className="h-5 w-5 hover:bg-accent shrink-0"
                onClick={handleCopyPath}
                title="Copy path"
              >
                {copied ? (
                  <CheckedIcon className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>

            {diffData && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 font-medium">
                <Badge variant={STATUS_VARIANTS[diffData.status] ?? 'secondary'} className="text-[9px] px-1 py-0 select-none">
                  {STATUS_LABELS[diffData.status] ?? diffData.status}
                </Badge>
                {!diffData.isBinary && (
                  <span>
                    <span className="text-green-500">+{diffData.additions}</span>
                    {' '}
                    <span className="text-red-500">-{diffData.deletions}</span>
                  </span>
                )}
                {isWip && (
                  <Badge variant={file.staged ? 'success' : 'secondary'} className="text-[9px] px-1 py-0 select-none">
                    {file.staged ? 'Staged' : 'Unstaged'}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: View mode tabs (Diff, File) */}
        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 shrink-0 mx-4">
          <button
            onClick={() => setActiveTab('diff')}
            className={cn(
              "px-4 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5",
              activeTab === 'diff'
                ? "bg-background text-foreground shadow-sm font-semibold border-b border-border/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Diff</span>
          </button>
          <button
            onClick={() => setActiveTab('file')}
            className={cn(
              "px-4 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5",
              activeTab === 'file'
                ? "bg-background text-foreground shadow-sm font-semibold border-b border-border/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>File</span>
          </button>
        </div>

        {/* Right Side: Diff toggle + Stage/Rollback Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Blame & History Toggles */}
          <div className="flex items-center border border-border rounded bg-card overflow-hidden mr-2">
            <Button
              variant={activeLeftPanel === 'blame' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none border-r border-border"
              onClick={() => setActiveLeftPanel(activeLeftPanel === 'blame' ? 'sidebar' : 'blame')}
              title="Git Blame"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Blame</span>
            </Button>
            <Button
              variant={activeLeftPanel === 'history' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none"
              onClick={() => setActiveLeftPanel(activeLeftPanel === 'history' ? 'sidebar' : 'history')}
              title="File History"
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
            </Button>
          </div>

          {/* Unified/Split Toggle & Change Navigation (only in Diff view) */}
          {activeTab === 'diff' && (
            <div className="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-right-1 duration-150">
              <div className="flex items-center border border-border rounded overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-none border-r border-border hover:bg-accent"
                  onClick={handlePrevChange}
                  title="Previous Change"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-none hover:bg-accent"
                  onClick={handleNextChange}
                  title="Next Change"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center border border-border rounded overflow-hidden">
                <Button
                  variant={viewMode === 'inline' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none border-r border-border"
                  onClick={() => setViewMode('inline')}
                >
                  <List className="h-3.5 w-3.5" />
                  <span>{t('commitDetails.diffInline')}</span>
                </Button>
                <Button
                  variant={viewMode === 'split' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none"
                  onClick={() => setViewMode('split')}
                >
                  <Columns className="h-3.5 w-3.5" />
                  <span>{t('commitDetails.diffSplit')}</span>
                </Button>
              </div>

              <Button
                variant={ignoreWhitespace ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-[10px] font-bold shrink-0 ml-2"
                onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}
                title="Ignore trim whitespace in diff"
              >
                Hide Whitespace
              </Button>
            </div>
          )}

          {/* WIP Action buttons */}
          {isWip && diffData && (
            <>
              <Button
                variant={file.staged ? 'outline' : 'default'}
                size="sm"
                className="h-7 px-3 text-[10px] font-bold gap-1"
                onClick={handleToggleStage}
                disabled={isProcessing}
              >
                {file.staged ? (
                  <>
                    <Minus className="h-3.5 w-3.5" />
                    Unstage
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Stage File
                  </>
                )}
              </Button>

              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-3 text-[10px] font-bold gap-1 hover:bg-destructive/90"
                onClick={handleRollback}
                disabled={isProcessing}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Discard
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-accent ml-1"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── DIFF CONTENT AREA ─────────────────────────────────────────────────── */}
      <div data-testid="diff-content-area" className="flex-1 bg-card/45 select-text font-mono text-xs flex flex-col overflow-hidden">
        {isLoading && (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner className="h-5 w-5 text-muted-foreground mr-2" />
            <span className="text-muted-foreground">Loading diff…</span>
          </div>
        )}

        {!isLoading && !diffData && (
          <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
            No difference data found.
          </div>
        )}

        {!isLoading && diffData && (
          <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
            {diffData.isBinary ? (
              <div data-testid="diff-binary-placeholder" className="rounded-lg border border-border bg-muted/20 px-4 py-8 text-center text-muted-foreground italic">
                Binary file diff content cannot be displayed.
              </div>
            ) : (
              <div className="flex-1 rounded-lg border border-border/80 bg-background flex flex-col overflow-hidden">
                <MonacoDiffViewer
                  ref={diffViewerRef}
                  original={rawContents?.original || ''}
                  modified={rawContents?.modified || ''}
                  filePath={file.path}
                  viewMode={viewMode}
                  activeTab={activeTab}
                  ignoreWhitespace={ignoreWhitespace}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
