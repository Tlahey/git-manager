import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Badge, Button, Input, ScrollArea, Spinner, toast } from '@git-manager/ui'
import type { GitDiffFile, PatchableDependency } from '@git-manager/git-types'
import {
  apiCommitDependencyPatch,
  apiListPatchableDependencies,
  apiPrepareDependencyPatch,
} from '../../api/git.api'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { parseUnifiedDiff, reconstructDiffSides } from '../../lib/parseUnifiedDiff'
import { CommitFileList, type ProcessedFileItem } from '../git-graph/components/CommitFileList'

const displayPath = (f: GitDiffFile) => (f.status === 'deleted' ? f.oldPath : f.newPath)

/** Right-panel for patching a node_modules dependency: a controls zone (dependency
 * picker → selected dependency + create) over a files-tree zone of the changed
 * files (click → center diff). */
export function DependencyPatchPanel({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const setActiveFile = usePatchWorkspaceStore((s) => s.setActiveFile)
  const close = usePatchWorkspaceStore((s) => s.close)

  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<PatchableDependency | null>(null)
  const [editDir, setEditDir] = useState<string | null>(null)
  const [files, setFiles] = useState<GitDiffFile[]>([])
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  const { data: deps, isLoading } = useQuery({
    queryKey: ['patchable-deps', repoPath],
    queryFn: () => apiListPatchableDependencies(repoPath),
  })

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (deps ?? []).filter((d) => !q || d.name.toLowerCase().includes(q))
  }, [deps, filter])

  const filesByPath = useMemo(() => {
    const m = new Map<string, GitDiffFile>()
    for (const f of files) m.set(displayPath(f), f)
    return m
  }, [files])

  const processedFiles = useMemo<ProcessedFileItem[]>(
    () =>
      files.map((f) => ({
        path: displayPath(f),
        status: f.status as ProcessedFileItem['status'],
        additions: f.additions,
        deletions: f.deletions,
        staged: false,
      })),
    [files]
  )

  function selectFile(file: { path: string }) {
    const f = filesByPath.get(file.path)
    if (f) setActiveFile({ path: file.path, ...reconstructDiffSides(f) })
  }

  async function selectDep(dep: PatchableDependency) {
    setSelected(dep)
    setFiles([])
    setActiveFile(null)
    setEditDir(null)
    setError(null)
    if (!dep.installed) {
      setError(t('patch.dependency.notInstalled'))
      return
    }
    setPreparing(true)
    try {
      const prepared = await apiPrepareDependencyPatch(repoPath, dep.name, dep.version)
      setEditDir(prepared.editDir)
      if (prepared.unchanged) {
        setError(t('patch.dependency.unchanged'))
        return
      }
      const parsed = parseUnifiedDiff(prepared.diff)
      setFiles(parsed)
      if (parsed[0]) {
        setActiveFile({ path: displayPath(parsed[0]), ...reconstructDiffSides(parsed[0]) })
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setPreparing(false)
    }
  }

  function back() {
    setSelected(null)
    setFiles([])
    setActiveFile(null)
    setEditDir(null)
    setError(null)
  }

  async function handleCommit() {
    if (!editDir || files.length === 0) return
    setCommitting(true)
    try {
      const result = await apiCommitDependencyPatch(repoPath, editDir)
      toast.success(t('patch.dependency.created'), { description: result.patchFile })
      queryClient.invalidateQueries({ queryKey: ['patchable-deps', repoPath] })
      close()
    } catch (err) {
      toast.error(t('patch.dependency.error'), { description: String(err) })
    } finally {
      setCommitting(false)
    }
  }

  // ── Dependency picker (single zone until a dependency is chosen) ────────────
  if (!selected) {
    return (
      <div
        className="flex h-full w-full min-w-0 flex-col"
        data-testid="dependency-patch-panel"
      >
        <div className="border-b border-border p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('patch.dependency.search')}
            data-testid="patch-dep-search"
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-4 w-4" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{t('patch.dependency.empty')}</p>
          ) : (
            <div className="p-1">
              {filtered.map((dep) => (
                <button
                  key={dep.name}
                  type="button"
                  onClick={() => selectDep(dep)}
                  data-testid={`patch-dep-${dep.name}`}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent ${
                    dep.installed ? '' : 'opacity-50'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-mono" title={dep.name}>
                    {dep.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{dep.version}</span>
                  {dep.patched && (
                    <Badge variant="success" className="shrink-0 text-[9px]">
                      {t('patch.dependency.patched')}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    )
  }

  // ── Selected dependency: controls zone + changed-files zone ────────────────
  return (
    <div
      className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card"
      data-testid="dependency-patch-panel"
    >
      {/* Zone du patch */}
      <div className="space-y-2 border-b border-border p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t('patch.cancel')}
            data-testid="patch-dep-back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={selected.name}>
            {selected.name}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{selected.version}</span>
        </div>
        {error && (
          <Alert variant="destructive" data-testid="patch-dep-error">
            <pre className="whitespace-pre-wrap font-mono text-[11px]">{error}</pre>
          </Alert>
        )}
        <Button
          className="w-full"
          size="sm"
          onClick={handleCommit}
          disabled={files.length === 0 || committing}
          data-testid="patch-dep-confirm"
        >
          {committing ? <Spinner className="mr-2 h-4 w-4" /> : null}
          {t('patch.dependency.confirm')}
        </Button>
      </div>

      {/* Zone des fichiers */}
      <style
        dangerouslySetInnerHTML={{
          __html: `.patch-scroll-area [data-radix-scroll-area-viewport] > div { display:block !important; width:100% !important; }`,
        }}
      />
      <ScrollArea className="patch-scroll-area w-full min-w-0 flex-1">
        <div className="w-full min-w-0 px-4 py-4">
          {preparing ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t('patch.dependency.preparing')}
            </div>
          ) : files.length > 0 ? (
            <CommitFileList
              repoPath={repoPath}
              isWip={false}
              commitOid="patch-dependency"
              processedFiles={processedFiles}
              onSelectFileDiff={selectFile}
              title={t('patch.zone.files', { count: files.length })}
              hideSearch
              cacheKey={`${repoPath}:patch:dep:${selected.name}`}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
