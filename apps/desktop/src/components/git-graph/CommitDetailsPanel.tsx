import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea, Button, Badge, Textarea, Spinner, cn, Input } from '@git-manager/ui'
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Folder,
  FolderOpen,
  FileText,
  GitCommit,
  Layers,
  History,
  Square,
  Pencil,
  Search,
  X,
  FolderTree,
  List
} from 'lucide-react'
import { useCommitDiff } from '../../hooks/useCommitDiff'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useOllamaGeneration } from '../../hooks/useOllamaGeneration'
import { useCommitMessageHistory } from '../../hooks/useCommitMessageHistory'
import { getAvatarUrl } from '../../lib/avatar'
import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  createCommit,
  discardFileChanges
} from '../../lib/tauri'
import { useQueryClient } from '@tanstack/react-query'
import type { GitGraphNode } from '@git-manager/git-types'

interface ProcessedFileItem {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  additions?: number
  deletions?: number
  staged: boolean
}

interface CommitDetailsPanelProps {
  node: GitGraphNode
  repoPath: string
  isHead?: boolean
  onSelectCommit?: (oid: string) => void
  onSelectFileDiff?: (file: { path: string; staged: boolean; oid?: string }) => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// ── Tree Construction Helper ──────────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  status?: string
  additions?: number
  deletions?: number
  staged?: boolean
  children?: Record<string, TreeNode>
  stats?: {
    added: number
    modified: number
    deleted: number
    renamed: number
  }
}

function buildFileTree(
  files: {
    path: string
    status: string
    additions?: number
    deletions?: number
    staged?: boolean
  }[]
): Record<string, TreeNode> {
  const root: Record<string, TreeNode> = {}

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    let cumulativePath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      cumulativePath = cumulativePath ? `${cumulativePath}/${part}` : part
      const isLast = i === parts.length - 1

      if (!current[part]) {
        current[part] = {
          name: part,
          path: cumulativePath,
          isFolder: !isLast,
          status: isLast ? file.status : undefined,
          additions: isLast ? file.additions : undefined,
          deletions: isLast ? file.deletions : undefined,
          staged: isLast ? file.staged : undefined,
          children: isLast ? undefined : {}
        }
      }

      if (!isLast && current[part].children) {
        current = current[part].children!
      }
    }
  }

  function computeFolderStats(node: TreeNode) {
    if (!node.isFolder) return

    const stats = { added: 0, modified: 0, deleted: 0, renamed: 0 }

    if (node.children) {
      for (const childName in node.children) {
        const child = node.children[childName]
        computeFolderStats(child)

        if (child.isFolder && child.stats) {
          stats.added += child.stats.added
          stats.modified += child.stats.modified
          stats.deleted += child.stats.deleted
          stats.renamed += child.stats.renamed
        } else if (!child.isFolder) {
          if (child.status === 'added' || child.status === 'untracked') {
            stats.added++
          } else if (child.status === 'modified') {
            stats.modified++
          } else if (child.status === 'deleted') {
            stats.deleted++
          } else if (child.status === 'renamed') {
            stats.renamed++
          }
        }
      }
    }

    node.stats = stats
  }

  for (const key in root) {
    computeFolderStats(root[key])
  }

  return root
}

function getSortedNodes(nodes: Record<string, TreeNode>): TreeNode[] {
  return Object.values(nodes).sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1
    if (!a.isFolder && b.isFolder) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

// ── Avatar Color Helper ───────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-green-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-red-500 to-rose-600',
  'from-pink-500 to-fuchsia-600'
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return Math.abs(hash)
}

function getAuthorAvatarStyle(name: string): string {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
}

function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function CommitDetailsAvatar({ name, email }: { name: string; email: string }) {
  const avatarUrl = getAvatarUrl(email, name)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [email, name])

  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md overflow-hidden ${
        avatarUrl && !imgError ? '' : getAuthorAvatarStyle(name)
      }`}
    >
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getAuthorInitials(name)
      )}
    </div>
  )
}

export function CommitDetailsPanel({
  node,
  repoPath,
  isHead: isHeadProp,
  onSelectCommit,
  onSelectFileDiff
}: CommitDetailsPanelProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { commit } = node
  const isWip = commit.oid === 'WIP'

  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [buttonState, setButtonState] = useState<'expand' | 'collapse'>('expand')
  const [fileSearchQuery, setFileSearchQuery] = useState('')

  // Commit editing states
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [isSavingMessage, setIsSavingMessage] = useState(false)

  // Reset/populate states when selected commit changes
  useEffect(() => {
    setIsEditingMessage(false)
    setEditSubject(commit?.subject ?? '')
    setEditBody(commit?.body ?? '')
    setExpandedFolders(new Set())
    setButtonState('expand')
    setFileSearchQuery('')
  }, [commit?.oid, commit?.subject, commit?.body])

  // Check if selected commit is HEAD (can be amended)
  // isHeadProp is always passed from GitGraph.tsx (it is the reliable source of truth)
  const isHead = isHeadProp ?? node.refs.some((r) => r.type === 'HEAD')
  console.log('[CommitDetailsPanel] isHead:', isHead, '| isHeadProp:', isHeadProp, '| oid:', commit?.oid?.slice(0, 8), '| refs:', node.refs.map(r => `${r.type}:${r.shortName}`))

  async function handleUpdateCommitMessage() {
    if (!editSubject.trim()) return
    setIsSavingMessage(true)
    try {
      const fullMessage = editBody.trim()
        ? `${editSubject.trim()}\n\n${editBody.trim()}`
        : editSubject.trim()
      
      // Utiliser l'OID du commit actuel pour l'amend
      const commitOidToAmend = commit.oid !== 'WIP' ? commit.oid : undefined
      await createCommit(repoPath, fullMessage, true, commitOidToAmend)
      setIsEditingMessage(false)
      invalidate()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsSavingMessage(false)
    }
  }

  // WIP panel States
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [batchMessages, setBatchMessages] = useState<Record<string, string>>({})
  const [batchGenerating, setBatchGenerating] = useState<Record<string, boolean>>({})

  // Temp status list for staging actions
  const { data: gitStatus } = useGitStatus(repoPath)
  const { data: diff } = useCommitDiff(
    repoPath,
    isWip ? '' : commit.oid
  )
  const { generate: runLlmGenerate, cancel: cancelLlmGenerate, status: llmStatus } =
    useOllamaGeneration(repoPath)
  const { history, addMessage } = useCommitMessageHistory()

  const isGenerating = llmStatus === 'connecting' || llmStatus === 'streaming'

  // Load parent remotes to generate Remote Link
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)

  useEffect(() => {
    // Attempt to extract remote git repo URL
    const getRemoteUrl = async () => {
      try {
        const repoData = queryClient.getQueryData<any>(['repo-cache', repoPath])
        const remotes: string[] = repoData?.remotes ?? []
        const origin = remotes.find((r) => r.includes('github.com') || r.includes('gitlab.com'))
        if (origin) {
          // parse git ssh or https url
          let url = origin.replace(/\.git$/, '')
          if (url.startsWith('git@')) {
            url = 'https://' + url.substring(4).replace(':', '/')
          }
          setRemoteUrl(url)
        }
      } catch (err) {
        // Ignored
      }
    }
    getRemoteUrl()
  }, [repoPath, queryClient])

  // Invalidate cache helpers
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
  }

  // Staging / Unstaging / Discard changes actions
  async function handleStage(file: string) {
    await stageFile(repoPath, file)
    invalidate()
  }

  async function handleUnstage(file: string) {
    await unstageFile(repoPath, file)
    invalidate()
  }

  async function handleDiscard(file: string) {
    const ok = window.confirm(t('commitDetails.discardPrompt'))
    if (ok) {
      await discardFileChanges(repoPath, file)
      invalidate()
    }
  }

  async function handleStageAllFiles() {
    await stageAll(repoPath)
    invalidate()
  }

  async function handleUnstageAllFiles() {
    await unstageAll(repoPath)
    invalidate()
  }

  // LLM Commit Generation
  function handleGenerateCommitMessage() {
    if (isGenerating) {
      cancelLlmGenerate()
      return
    }

    let accumulated = ''
    setCommitMessage('')
    runLlmGenerate(
      (token: string) => {
        accumulated += token
        setCommitMessage(accumulated)
      },
      (full: string) => {
        addMessage(full)
      }
    )
  }

  async function handleCommitWip() {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    try {
      await createCommit(repoPath, commitMessage)
      setCommitMessage('')
      invalidate()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  async function handleCopySha() {
    await navigator.clipboard.writeText(commit.oid)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ── Smart Batch Commits Logic ──────────────────────────────────────────────

  const allWipChanges = useMemo<ProcessedFileItem[]>(() => {
    if (!gitStatus) return []
    const list: ProcessedFileItem[] = []
    gitStatus.staged.forEach((f) =>
      list.push({
        path: f.path,
        status: f.status as any,
        additions: undefined,
        deletions: undefined,
        staged: true
      })
    )
    gitStatus.unstaged.forEach((f) =>
      list.push({
        path: f.path,
        status: f.status as any,
        additions: undefined,
        deletions: undefined,
        staged: false
      })
    )
    gitStatus.untracked.forEach((f) =>
      list.push({
        path: f,
        status: 'untracked',
        additions: undefined,
        deletions: undefined,
        staged: false
      })
    )
    return list
  }, [gitStatus])

  const wipBatches = useMemo(() => {
    const batches: Record<string, typeof allWipChanges> = {}
    allWipChanges.forEach((f) => {
      const parts = f.path.split('/')
      const groupName = parts.length > 1 ? parts[0] : 'root'
      if (!batches[groupName]) {
        batches[groupName] = []
      }
      batches[groupName].push(f)
    })
    return batches
  }, [allWipChanges])

  // Temporarily stage files of a batch, generate message via LLM, then restore index
  async function generateMessageForBatch(groupName: string, files: typeof allWipChanges) {
    if (batchGenerating[groupName]) return

    setBatchGenerating((prev) => ({ ...prev, [groupName]: true }))
    setBatchMessages((prev) => ({ ...prev, [groupName]: t('commitDetails.batchCommit.generating') }))

    try {
      // 1. Get currently staged files
      const originallyStaged = (gitStatus?.staged ?? []).map((x) => x.path)

      // 2. Unstage everything
      await unstageAll(repoPath)

      // 3. Stage only files of this batch
      for (const file of files) {
        if (file.status !== 'deleted') {
          await stageFile(repoPath, file.path)
        } else {
          // deleted files must be unstaged/removed from index
          await unstageFile(repoPath, file.path)
        }
      }

      // 4. Call Ollama
      let accumulated = ''
      await new Promise<void>((resolve, reject) => {
        runLlmGenerate(
          (token: string) => {
            accumulated += token
            setBatchMessages((prev) => ({ ...prev, [groupName]: accumulated }))
          },
          (full: string) => {
            addMessage(full)
            resolve()
          }
        ).catch(reject)
      })

      // 5. Restore original staging state
      await unstageAll(repoPath)
      const freshStatus = await queryClient.fetchQuery<any>({
        queryKey: ['git-status', repoPath]
      })
      const activeChanges = new Set<string>([
        ...(freshStatus?.unstaged ?? []).map((x: any) => x.path),
        ...(freshStatus?.untracked ?? [])
      ])
      for (const path of originallyStaged) {
        if (activeChanges.has(path)) {
          await stageFile(repoPath, path)
        }
      }
      invalidate()
    } catch (err) {
      setBatchMessages((prev) => ({ ...prev, [groupName]: `Error: ${String(err)}` }))
    } finally {
      setBatchGenerating((prev) => ({ ...prev, [groupName]: false }))
    }
  }

  // Stages batch files, commits them, then restores remaining originally staged
  async function commitBatch(groupName: string, files: typeof allWipChanges) {
    const msg = batchMessages[groupName]?.trim()
    if (!msg) {
      alert(t('commit.emptyMessage'))
      return
    }

    try {
      const originallyStaged = (gitStatus?.staged ?? []).map((x) => x.path)
      const batchFileSet = new Set(files.map((x) => x.path))

      // Unstage all
      await unstageAll(repoPath)

      // Stage only batch
      for (const file of files) {
        await stageFile(repoPath, file.path)
      }

      // Commit
      await createCommit(repoPath, msg)

      // Clear batch message
      setBatchMessages((prev) => {
        const next = { ...prev }
        delete next[groupName]
        return next
      })

      // Restore remaining originally staged files
      const freshStatus = await queryClient.fetchQuery<any>({
        queryKey: ['git-status', repoPath]
      })
      const activeChanges = new Set<string>([
        ...(freshStatus?.unstaged ?? []).map((x: any) => x.path),
        ...(freshStatus?.untracked ?? [])
      ])
      for (const path of originallyStaged) {
        if (!batchFileSet.has(path) && activeChanges.has(path)) {
          await stageFile(repoPath, path)
        }
      }
      invalidate()
    } catch (err) {
      alert(String(err))
    }
  }

  // ── Folder Tree Collapse/Expand toggle ──────────────────────────────────────

  function toggleFolder(folderPath: string) {
    let wasExpanded = false
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
        wasExpanded = true
      } else {
        next.add(folderPath)
      }
      return next
    })
    if (wasExpanded) {
      setButtonState('expand')
    }
  }

  // ── Render Recursive Tree Node ──────────────────────────────────────────────

  const statusIcons: Record<string, string> = {
    added: 'text-green-500 font-bold text-xs',
    modified: 'text-yellow-500 font-bold text-xs',
    deleted: 'text-red-500 font-bold text-xs',
    renamed: 'text-blue-500 font-bold text-xs',
    untracked: 'text-muted-foreground font-bold text-xs'
  }

  const statusLetters: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?'
  }

  function renderTreeNode(node: TreeNode, depth = 0) {
    const isExpanded = expandedFolders.has(node.path)

    if (node.isFolder) {
      return (
        <div key={node.path} className="flex flex-col">
          <div
            onClick={() => toggleFolder(node.path)}
            className="flex items-center gap-1.5 py-1 px-2 text-xs hover:bg-accent/40 rounded transition-colors text-left font-medium cursor-pointer w-full min-w-0"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleFolder(node.path)
              }
            }}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            )}
            <span className="truncate text-foreground/90 flex-1 min-w-0">{node.name}</span>
            {node.stats && (
              <div className="flex items-center gap-1 shrink-0 ml-2 select-none text-[9px] font-bold">
                {node.stats.added > 0 && (
                  <span className="text-green-500 bg-green-500/10 px-1 rounded">
                    +{node.stats.added}
                  </span>
                )}
                {node.stats.modified > 0 && (
                  <span className="text-yellow-500 bg-yellow-500/10 px-1 rounded">
                    ~{node.stats.modified}
                  </span>
                )}
                {node.stats.deleted > 0 && (
                  <span className="text-red-500 bg-red-500/10 px-1 rounded">
                    -{node.stats.deleted}
                  </span>
                )}
                {node.stats.renamed > 0 && (
                  <span className="text-blue-500 bg-blue-500/10 px-1 rounded">
                    →{node.stats.renamed}
                  </span>
                )}
              </div>
            )}
          </div>
          {isExpanded && node.children && (
            <div className="flex flex-col">
              {getSortedNodes(node.children).map((child) =>
                renderTreeNode(child, depth + 1)
              )}
            </div>
          )}
        </div>
      )
    }

    const fileStatus = node.status ?? 'modified'
    return (
      <div
        key={node.path}
        className="group/file flex items-center justify-between py-1 px-2 text-xs hover:bg-accent rounded transition-colors cursor-pointer w-full min-w-0"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() =>
          onSelectFileDiff?.({
            path: node.path,
            staged: node.staged ?? false,
            oid: isWip ? undefined : commit.oid
          })
        }
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelectFileDiff?.({
              path: node.path,
              staged: node.staged ?? false,
              oid: isWip ? undefined : commit.oid
            })
          }
        }}
      >
        {/* Left: File Icon and Filename */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <span className="font-mono text-foreground truncate min-w-0 flex-1">{node.name}</span>
        </div>

        {/* Right: Stats, Status, WIP Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          {node.additions !== undefined && node.deletions !== undefined && (
            <span className="text-[10px] text-muted-foreground/70 scale-90 select-none shrink-0 flex items-center gap-0.5">
              <span className="text-green-500">+{node.additions}</span>
              <span className="text-red-500">-{node.deletions}</span>
            </span>
          )}

          <span className={cn(statusIcons[fileStatus], "shrink-0 min-w-[12px] text-center select-none")}>
            {statusLetters[fileStatus]}
          </span>

          {isWip && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => (node.staged ? handleUnstage(node.path) : handleStage(node.path))}
                className={cn(
                  "h-4 w-4 flex items-center justify-center text-[10px] font-bold border rounded transition-colors shrink-0",
                  node.staged
                    ? "bg-primary border-primary text-white"
                    : "border-border hover:border-primary/60 text-transparent hover:text-muted-foreground"
                )}
                title={node.staged ? 'Unstage' : 'Stage'}
              >
                ✓
              </button>
              <button
                onClick={() => handleDiscard(node.path)}
                className="p-0.5 border rounded border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title="Discard Changes"
              >
                <RotateCcw className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Render Normal Commit details ──────────────────────────────────────────

  const parentOids = commit.parentOids ?? []

  // Files flat list or trees
  const processedFiles = useMemo<ProcessedFileItem[]>(() => {
    if (isWip) {
      return allWipChanges
    }
    return (diff?.files ?? []).map((f) => ({
      path: f.newPath || f.oldPath,
      status: f.status as any,
      additions: f.additions,
      deletions: f.deletions,
      staged: false
    }))
  }, [isWip, diff, allWipChanges])

  // File stats
  const fileStats = useMemo(() => {
    let added = 0
    let modified = 0
    let deleted = 0
    let renamed = 0

    processedFiles.forEach((file) => {
      if (file.status === 'added' || file.status === 'untracked') added++
      else if (file.status === 'modified') modified++
      else if (file.status === 'deleted') deleted++
      else if (file.status === 'renamed') renamed++
    })

    return { added, modified, deleted, renamed }
  }, [processedFiles])

  // Search filtering
  const filteredFiles = useMemo(() => {
    if (!fileSearchQuery.trim()) return processedFiles
    const query = fileSearchQuery.toLowerCase()
    return processedFiles.filter((file) => file.path.toLowerCase().includes(query))
  }, [processedFiles, fileSearchQuery])

  // Expandable folder paths calculation
  const allFolderPaths = useMemo(() => {
    const folders = new Set<string>()
    processedFiles.forEach((file) => {
      const parts = file.path.split('/')
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i]
        folders.add(current)
      }
    })
    return folders
  }, [processedFiles])

  // Auto-expand folders when typing search query
  useEffect(() => {
    if (fileSearchQuery.trim()) {
      const foldersToExpand = new Set<string>()
      filteredFiles.forEach((file) => {
        const parts = file.path.split('/')
        let current = ''
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i]
          foldersToExpand.add(current)
        }
      })
      setExpandedFolders(foldersToExpand)
      setButtonState('collapse')
    }
  }, [fileSearchQuery, filteredFiles])

  // Toggle expand/collapse all
  function handleToggleExpandAll() {
    if (buttonState === 'expand') {
      setExpandedFolders(new Set(allFolderPaths))
      setButtonState('collapse')
    } else {
      setExpandedFolders(new Set())
      setButtonState('expand')
    }
  }

  const fileTreeRoot = useMemo(() => {
    return buildFileTree(filteredFiles)
  }, [filteredFiles])

  // Simple Markdown Parser for messages
  const messageBodyParsed = useMemo(() => {
    if (!commit.body) return null
    const lines = commit.body.split('\n')
    return lines.map((line, idx) => {
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return (
          <li key={idx} className="ml-4 list-disc text-muted-foreground/90 pl-1 leading-relaxed">
            {line.trim().substring(1).trim()}
          </li>
        )
      }
      return (
        <p key={idx} className="text-muted-foreground leading-relaxed min-h-[1.2em]">
          {line}
        </p>
      )
    })
  }, [commit.body])

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card shadow-2xl min-w-0">
      {/* ── PANEL HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3 bg-muted/20">
        {/* Title */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {isWip ? (
              <>
                <Layers className="h-3.5 w-3.5 text-primary" />
                {t('workingTree.title')}
              </>
            ) : (
              <>
                <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
                {t('commitDetails.title')}
              </>
            )}
          </h3>
        </div>

        {/* Author Avatar + Author Name + Email + Date */}
        {!isWip && (
          <div className="flex items-center gap-2.5 mt-1 border-t border-border/20 pt-2">
            <CommitDetailsAvatar name={commit.author.name} email={commit.author.email} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">
                {commit.author.name}
              </span>
              <span className="text-[10px] text-muted-foreground/80 truncate">
                &lt;{commit.author.email}&gt;
              </span>
              <span className="text-[9px] text-muted-foreground/60 mt-0.5 font-medium">
                {formatDate(commit.author.timestamp)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── PANEL SCROLL BODY ─────────────────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .details-scroll-area [data-radix-scroll-area-viewport] > div {
          display: block !important;
          width: 100% !important;
        }
      `}} />
      <ScrollArea className="flex-1 min-w-0 w-full details-scroll-area">
        <div className="px-4 py-4 space-y-4 min-w-0 w-full overflow-hidden">
          {/* Commit Message Box */}
          {!isWip && (
            isEditingMessage ? (
              <div data-testid="commit-amend-form" className="border border-border bg-muted/5 rounded-lg p-3 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Subject
                    </span>
                    <span
                      data-testid="commit-subject-counter"
                      className={cn("text-[10px] font-mono", 72 - editSubject.length < 10 ? "text-destructive font-bold" : "text-muted-foreground")}
                    >
                      {72 - editSubject.length} chars remaining
                    </span>
                  </div>
                  <Input
                    data-testid="commit-subject-input"
                    autoFocus
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    maxLength={72}
                    placeholder="Commit subject..."
                    className="text-xs font-mono font-bold h-8"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Description
                  </span>
                  <Textarea
                    data-testid="commit-body-textarea"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Commit description (optional)..."
                    rows={4}
                    className="resize-none text-xs font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid="commit-amend-submit"
                    size="sm"
                    className="flex-1 text-xs h-8 font-semibold"
                    onClick={handleUpdateCommitMessage}
                    disabled={!editSubject.trim() || isSavingMessage}
                  >
                    {isSavingMessage ? <Spinner className="mr-1.5 h-3 w-3" /> : null}
                    {t('commitDetails.updateMessage')}
                  </Button>
                  <Button
                    data-testid="commit-amend-cancel"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8 font-semibold"
                    onClick={() => setIsEditingMessage(false)}
                    disabled={isSavingMessage}
                  >
                    {t('commitDetails.cancelAmend')}
                  </Button>
                </div>
              </div>
            ) : isHead ? (
              <div
                data-testid="commit-message-clickable"
                role="button"
                tabIndex={0}
                onClick={() => setIsEditingMessage(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditingMessage(true) }}
                className="bg-muted/15 border border-border/30 hover:border-primary/50 hover:bg-accent/15 cursor-pointer rounded-lg p-3 space-y-2 group transition-all"
                title="Click to edit commit message (amend)"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 data-testid="commit-subject-display" className="text-xs font-bold text-foreground leading-snug break-words flex-1">
                    {commit.subject}
                  </h4>
                  <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 mt-0.5 transition-all duration-200" />
                </div>
                {commit.body && (
                  <div className="text-[11px] space-y-1.5 pt-1 border-t border-border/20 font-normal">
                    {messageBodyParsed}
                  </div>
                )}
              </div>
            ) : (
              <div 
                data-testid="commit-message-readonly" 
                role="button"
                tabIndex={0}
                onClick={() => setIsEditingMessage(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditingMessage(true) }}
                className="bg-muted/15 border border-border/30 hover:border-primary/50 hover:bg-accent/15 cursor-pointer rounded-lg p-3 space-y-2 group transition-all"
                title="Click to edit commit message"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-foreground leading-snug break-words flex-1">
                    {commit.subject}
                  </h4>
                  <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 mt-0.5 transition-all duration-200" />
                </div>
                {commit.body && (
                  <div className="text-[11px] space-y-1.5 pt-1 border-t border-border/20 font-normal">
                    {messageBodyParsed}
                  </div>
                )}
              </div>
            )
          )}

          {/* Commit SHA, Parents Display, and Statistics */}
          {!isWip && (
            <div className="space-y-2.5 pt-1 border-t border-border/20">
              {/* Commit SHA & GitHub Link */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('commitDetails.sha') || 'SHA'}:
                </span>
                <div className="flex items-center gap-1 bg-muted/65 p-0.5 rounded border border-border/40">
                  <code className="text-[10px] font-mono text-foreground font-semibold px-1 select-all truncate max-w-[200px]" title={commit.oid}>
                    {commit.oid}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-accent/80 transition-colors"
                    onClick={handleCopySha}
                    title={t('gitTree.detailPanel.copy')}
                  >
                    {copied ? (
                      <Check className="h-2 w-2 text-green-500 shrink-0" />
                    ) : (
                      <Copy className="h-2 w-2 text-muted-foreground shrink-0" />
                    )}
                  </Button>
                </div>
                
                {remoteUrl && (
                  <a
                    href={`${remoteUrl}/commit/${commit.oid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline transition-all font-semibold shrink-0"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>

              {/* Parents display */}
              {parentOids.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                    {t('commitDetails.parents') || 'Parents'}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {parentOids.map((p) => (
                      <button
                        key={p}
                        onClick={() => onSelectCommit?.(p)}
                        className="text-[10px] font-mono bg-accent/60 hover:bg-primary/15 hover:text-primary hover:border-primary/45 border border-border px-2 py-0.5 rounded transition-all font-semibold"
                      >
                        {p.substring(0, 7)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Global Statistics Summary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Stats Summary
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted/65 px-1.5 py-0.5 rounded border border-border/40 font-mono">
                {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'} changed
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-medium text-muted-foreground bg-muted/5 p-2 rounded-md border border-border/20">
              {fileStats.added > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span>{fileStats.added} {t('commitDetails.stats.added') || 'added'}</span>
                </span>
              )}
              {fileStats.modified > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span>{fileStats.modified} {t('commitDetails.stats.modified') || 'modified'}</span>
                </span>
              )}
              {fileStats.deleted > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>{fileStats.deleted} {t('commitDetails.stats.deleted') || 'deleted'}</span>
                </span>
              )}
              {fileStats.renamed > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>{fileStats.renamed} {t('commitDetails.stats.renamed') || 'renamed'}</span>
                </span>
              )}
              {processedFiles.length === 0 && (
                <span className="italic text-muted-foreground/60">{t('workingTree.noChanges')}</span>
              )}
            </div>
          </div>

          {/* Search bar inside files */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('commitDetails.searchFiles') || "Filter files..."}
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs font-mono"
            />
            {fileSearchQuery && (
              <button
                onClick={() => setFileSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* ── FILES TREE OR LIST VIEW ────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-muted/10 p-1.5 rounded-lg border border-border/30">
              <div className="flex items-center gap-2 pl-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                  Modifications
                </span>
                {viewMode === 'tree' && allFolderPaths.size > 0 && (
                  <>
                    <span className="text-muted-foreground/30 text-[10px] select-none">•</span>
                    <button
                      onClick={handleToggleExpandAll}
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      {buttonState === 'expand' ? t('commitDetails.expandAll') : t('commitDetails.collapseAll')}
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center border border-border/55 rounded overflow-hidden bg-card">
                <button
                  onClick={() => setViewMode('tree')}
                  className={`p-1.5 transition-all ${
                    viewMode === 'tree' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'
                  }`}
                  title={t('commitDetails.viewModeTree') || "Tree structure"}
                >
                  <FolderTree className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 transition-all ${
                    viewMode === 'list' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'
                  }`}
                  title={t('commitDetails.viewModeList') || "Flat list"}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Tree rendering */}
            {viewMode === 'tree' && (
              <div className="space-y-0.5">
                {filteredFiles.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/70 italic px-2 py-1">
                    {t('workingTree.noChanges')}
                  </p>
                ) : (
                  getSortedNodes(fileTreeRoot).map((node) => renderTreeNode(node))
                )}
              </div>
            )}

            {/* List rendering */}
            {viewMode === 'list' && (
              <div className="space-y-0.5">
                {filteredFiles.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/70 italic px-2 py-1">
                    {t('workingTree.noChanges')}
                  </p>
                ) : (
                  filteredFiles.map((file) => (
                    <div
                      key={file.path}
                      className="group/file flex items-center justify-between py-1 px-2 text-xs hover:bg-accent rounded transition-colors cursor-pointer w-full min-w-0"
                      onClick={() =>
                        onSelectFileDiff?.({
                          path: file.path,
                          staged: file.staged,
                          oid: isWip ? undefined : commit.oid
                        })
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          onSelectFileDiff?.({
                            path: file.path,
                            staged: file.staged,
                            oid: isWip ? undefined : commit.oid
                          })
                        }
                      }}
                    >
                      {/* Left: File Icon and Consecutive Path Display */}
                      <div className="flex items-center min-w-0 flex-1 mr-4">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mr-1.5" />
                        <div className="min-w-0 flex-1 flex items-center font-mono text-[11px] leading-tight select-text overflow-hidden">
                          {(() => {
                            const lastSlash = file.path.lastIndexOf('/')
                            if (lastSlash === -1) {
                              return <span className="text-foreground font-semibold truncate min-w-0 flex-1">{file.path}</span>
                            }
                            const dir = file.path.substring(0, lastSlash + 1)
                            const name = file.path.substring(lastSlash + 1)
                            return (
                              <>
                                <span className="text-muted-foreground/45 truncate min-w-0 shrink pr-0.5">{dir}</span>
                                <span className="text-foreground font-semibold shrink-0">{name}</span>
                              </>
                            )
                          })()}
                        </div>
                      </div>

                      {/* Right: Stats, Status Letter, WIP Actions */}
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {file.additions !== undefined && file.deletions !== undefined && (
                          <span className="text-[10px] text-muted-foreground/70 scale-90 select-none shrink-0 flex items-center gap-0.5">
                            <span className="text-green-500">+{file.additions}</span>
                            <span className="text-red-500">-{file.deletions}</span>
                          </span>
                        )}

                        <span className={cn(statusIcons[file.status], "shrink-0 min-w-[12px] text-center select-none")}>
                          {statusLetters[file.status]}
                        </span>

                        {isWip && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() =>
                                file.staged ? handleUnstage(file.path) : handleStage(file.path)
                              }
                              className={cn(
                                "h-4 w-4 flex items-center justify-center text-[10px] font-bold border rounded transition-colors shrink-0",
                                file.staged
                                  ? "bg-primary border-primary text-white"
                                  : "border-border hover:border-primary/60 text-transparent hover:text-muted-foreground"
                              )}
                              title={file.staged ? 'Unstage' : 'Stage'}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleDiscard(file.path)}
                              className="p-0.5 border rounded border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                              title="Discard Changes"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── BATCH COMMIT SECTION (WIP ONLY) ────────────────────────────────── */}
          {isWip && allWipChanges.length > 0 && (
            <div className="pt-2 border-t border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setBatchMode((b) => !b)}
                  className="flex items-center gap-1.5 text-xs text-primary font-bold hover:opacity-85 select-none"
                >
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {batchMode
                      ? '← Retour au commit global'
                      : t('commitDetails.batchCommit.title')}
                  </span>
                </button>
                {!batchMode && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] font-bold"
                      onClick={handleStageAllFiles}
                    >
                      {t('workingTree.stageAll')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] font-bold"
                      onClick={handleUnstageAllFiles}
                    >
                      {t('workingTree.unstageAll')}
                    </Button>
                  </div>
                )}
              </div>

              {batchMode ? (
                /* Smart Batch Mode */
                <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-[10px] text-muted-foreground font-medium leading-relaxed pb-1 border-b border-border/20">
                    {t('commitDetails.batchCommit.subtitle')}
                  </p>

                  {Object.keys(wipBatches).map((groupName) => {
                    const files = wipBatches[groupName]
                    const msg = batchMessages[groupName] ?? ''
                    const isGen = batchGenerating[groupName]

                    return (
                      <div
                        key={groupName}
                        className="border border-border/40 bg-muted/10 rounded-lg p-3 space-y-2.5"
                      >
                        {/* Group Header */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-primary font-mono truncate">
                            /{groupName}
                          </span>
                          <Badge variant="secondary" className="text-[9px] font-bold">
                            {files.length} file(s)
                          </Badge>
                        </div>

                        {/* Files in Group */}
                        <div className="max-h-24 overflow-y-auto border border-border/30 rounded p-1.5 bg-card space-y-0.5">
                          {files.map((file) => (
                            <div key={file.path} className="flex items-center justify-between text-[10px] py-0.5 font-mono w-full min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-4">
                                <span className={cn(statusIcons[file.status], "shrink-0 min-w-[12px] text-center select-none")}>
                                  {statusLetters[file.status]}
                                </span>
                                {(() => {
                                  const lastSlash = file.path.lastIndexOf('/')
                                  if (lastSlash === -1) return null
                                  const dir = file.path.substring(0, lastSlash + 1)
                                  return (
                                    <span className="text-muted-foreground/45 truncate min-w-0 shrink pr-0.5 text-[9px] leading-tight select-text">
                                      {dir}
                                    </span>
                                  )
                                })()}
                              </div>
                              <span className="text-foreground font-semibold shrink-0 truncate min-w-0 text-[9px] leading-tight select-all">
                                {(() => {
                                  const lastSlash = file.path.lastIndexOf('/')
                                  return lastSlash === -1 ? file.path : file.path.substring(lastSlash + 1)
                                })()}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Message Box */}
                        <div className="space-y-1.5">
                          <Textarea
                            value={msg}
                            onChange={(e) =>
                              setBatchMessages((prev) => ({
                                ...prev,
                                [groupName]: e.target.value
                              }))
                            }
                            placeholder={t('commitDetails.batchCommit.placeholder')}
                            rows={2}
                            className="resize-none text-[11px] font-mono"
                            disabled={isGen}
                          />

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-7 text-[10px] font-semibold gap-1"
                              onClick={() => generateMessageForBatch(groupName, files)}
                              disabled={isGen}
                            >
                              {isGen ? (
                                <Spinner className="h-2.5 w-2.5" />
                              ) : (
                                <Sparkles className="h-3 w-3 text-primary" />
                              )}
                              <span>
                                {isGen
                                  ? t('commitDetails.batchCommit.generating')
                                  : t('commit.generate')}
                              </span>
                            </Button>

                            <Button
                              size="sm"
                              className="flex-1 h-7 text-[10px] font-semibold gap-1"
                              onClick={() => commitBatch(groupName, files)}
                              disabled={isGen || !msg.trim()}
                            >
                              <Check className="h-3 w-3 text-white" />
                              <span>{t('commitDetails.batchCommit.commitBatch')}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Classic Staged / Unstaged List + Commit message */
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {t('commit.title')}
                    </span>
                    <Textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder={t('commit.placeholder')}
                      rows={3}
                      className="resize-none font-mono text-xs"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 rounded-r-none text-xs border-r-0 h-8"
                        onClick={handleGenerateCommitMessage}
                        disabled={gitStatus?.staged?.length === 0 && !isGenerating}
                      >
                        {isGenerating ? (
                          <>
                            <Square className="h-3 w-3 text-destructive animate-pulse" />
                            {t('commit.stop')}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 text-primary" />
                            {t('commit.generate')}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-7 rounded-l-none px-0 text-xs"
                        onClick={() => setHistoryOpen((v) => !v)}
                        disabled={isGenerating}
                        title={t('commit.history')}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>

                      {historyOpen && (
                        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-full min-w-[220px] rounded-lg border border-border bg-background shadow-xl p-1 animate-in fade-in duration-100">
                          <div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
                            <History className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground">
                              {t('commit.history')}
                            </span>
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {history.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-muted-foreground/70 italic">
                                {t('commit.historyEmpty')}
                              </p>
                            ) : (
                              history.map((msg, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    setCommitMessage(msg)
                                    setHistoryOpen(false)
                                  }}
                                  className="w-full truncate px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors font-mono"
                                >
                                  {msg}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={handleCommitWip}
                      disabled={
                        (gitStatus?.staged?.length ?? 0) === 0 ||
                        !commitMessage.trim() ||
                        isCommitting
                      }
                    >
                      {isCommitting ? <Spinner className="mr-1.5 h-3 w-3" /> : null}
                      {t('commit.commit')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
