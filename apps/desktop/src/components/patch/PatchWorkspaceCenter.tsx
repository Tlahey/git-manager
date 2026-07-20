import { useTranslation } from '@git-manager/i18n'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { useFileRawContents } from '../../hooks/useFileRawContents'
import { ThreeWayMergeEditor } from '../merge-editor/ThreeWayMergeEditor'

/**
 * Center pane of the patch workspace: the selected file's diff, shown in the same
 * two-pane Monaco editor (`ThreeWayMergeEditor` in two-way mode) the commit and
 * PR diff views use. For `create` the real working-tree contents are fetched; for
 * apply/dependency the sides come pre-reconstructed from the patch text.
 */
export function PatchWorkspaceCenter({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const mode = usePatchWorkspaceStore((s) => s.mode)
  const activeFile = usePatchWorkspaceStore((s) => s.activeFile)

  // `create` has no pre-built sides → pull the real working-tree diff contents.
  const needsFetch = !!activeFile && activeFile.original === undefined
  const { data: raw } = useFileRawContents(repoPath, needsFetch ? activeFile.path : null, false)

  const original = activeFile?.original ?? raw?.original ?? ''
  const modified = activeFile?.modified ?? raw?.modified ?? ''

  return (
    <div className="flex h-full flex-col" data-testid="patch-workspace-center">
      {activeFile ? (
        <>
          <div className="truncate border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
            {activeFile.path}
          </div>
          <div className="min-h-0 flex-1">
            <ThreeWayMergeEditor
              key={`${mode}:${activeFile.path}`}
              repoPath={repoPath}
              filePath={activeFile.path}
              original={original}
              modified={modified}
              isTwoWay
            />
          </div>
        </>
      ) : (
        <p className="p-6 text-center text-xs text-muted-foreground">{t('patch.selectFileHint')}</p>
      )}
    </div>
  )
}
