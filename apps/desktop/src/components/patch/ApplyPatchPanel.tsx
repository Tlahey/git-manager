import { useMemo, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FileUp } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Button, ScrollArea, Spinner, toast } from '@git-manager/ui'
import type { GitDiffFile } from '@git-manager/git-types'
import { apiApplyPatch, apiReadPatchFile } from '../../api/git.api'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { parseUnifiedDiff, reconstructDiffSides } from '../../lib/parseUnifiedDiff'
import { CommitFileList, type ProcessedFileItem } from '../git-graph/components/CommitFileList'

const displayPath = (f: GitDiffFile) => (f.status === 'deleted' ? f.oldPath : f.newPath)

/** Right-panel for applying an external `.patch`/`.diff`: a controls zone (choose /
 * apply) over a files-tree zone listing the patch's files (click → center diff). */
export function ApplyPatchPanel({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const setActiveFile = usePatchWorkspaceStore((s) => s.setActiveFile)
  const close = usePatchWorkspaceStore((s) => s.close)
  const [patchPath, setPatchPath] = useState<string | null>(null)
  const [files, setFiles] = useState<GitDiffFile[]>([])
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)

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

  async function handleChoose() {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: 'Patch', extensions: ['patch', 'diff'] }],
    })
    if (typeof picked !== 'string') return
    setPatchPath(picked)
    setCheckError(null)
    setActiveFile(null)
    setChecking(true)
    try {
      const content = await apiReadPatchFile(picked)
      const parsed = parseUnifiedDiff(content)
      setFiles(parsed)
      if (parsed[0]) {
        setActiveFile({ path: displayPath(parsed[0]), ...reconstructDiffSides(parsed[0]) })
      }
      await apiApplyPatch(repoPath, picked, true) // dry run
    } catch (err) {
      setCheckError(String(err))
    } finally {
      setChecking(false)
    }
  }

  async function handleApply() {
    if (!patchPath) return
    setApplying(true)
    try {
      await apiApplyPatch(repoPath, patchPath, false)
      toast.success(t('patch.apply.applied'))
      close()
    } catch (err) {
      toast.error(t('patch.apply.error'), { description: String(err) })
    } finally {
      setApplying(false)
    }
  }

  const fileName = patchPath ? patchPath.slice(patchPath.lastIndexOf('/') + 1) : null
  const canApply = !!patchPath && !checkError && !checking

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* Zone du patch */}
      <div className="space-y-2 border-b border-border p-3">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={handleChoose}
          data-testid="patch-choose-file"
        >
          <FileUp className="mr-2 h-4 w-4" />
          {t('patch.apply.choose')}
        </Button>
        {fileName && (
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={patchPath!}>
            {fileName}
          </p>
        )}
        {checkError && (
          <Alert variant="destructive" data-testid="patch-check-error">
            <p className="text-xs font-medium">{t('patch.apply.checkFailed')}</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{checkError}</pre>
          </Alert>
        )}
        <Button
          className="w-full"
          size="sm"
          onClick={handleApply}
          disabled={!canApply || applying}
          data-testid="patch-apply-confirm"
        >
          {applying ? <Spinner className="mr-2 h-4 w-4" /> : null}
          {t('patch.apply.confirm')}
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
          {checking ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t('patch.apply.checking')}
            </div>
          ) : files.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('patch.apply.description')}</p>
          ) : (
            <CommitFileList
              repoPath={repoPath}
              isWip={false}
              commitOid="patch-apply"
              processedFiles={processedFiles}
              onSelectFileDiff={selectFile}
              title={t('patch.zone.files', { count: files.length })}
              hideSearch
              cacheKey={`${repoPath}:patch:apply`}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
