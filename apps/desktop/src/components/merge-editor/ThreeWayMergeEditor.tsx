import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { Lock } from 'lucide-react'
import type { ThreeWayMergeView } from '@git-manager/git-types'
import {
  ConflictResolver,
  type ConflictResolverPanel,
  type ConflictResolverRef,
  type CodePaneEditorComponent,
} from '@git-manager/code-view'
import { useSWRConfig } from 'swr'
import { apiAutoMergeConflictView } from '../../api/conflict.api'
import { useRebaseState } from '../../hooks/useRebaseState'
import { useSettingsStore } from '../../stores/settings.store'
import { registerAndApplyDynamicTheme } from '../../lib/monacoThemes'
import { MonacoEditor, languageForFilePath } from '../../lib/monacoSetup'

interface ThreeWayMergeEditorProps {
  repoPath: string
  filePath: string
  view?: ThreeWayMergeView
  original?: string
  modified?: string
  isTwoWay?: boolean
  onPendingCountChange?: (count: number) => void
  /** Draw the JetBrains-style hermetic 2px top/bottom edges around each block (and the matching
   * closing edges on the hatched filler zones). Off by default — the colored fills alone. */
  showBlockBorders?: boolean
}

export type ThreeWayMergeEditorRef = ConflictResolverRef

/** App-side binding of `@git-manager/code-view`'s generic `ConflictResolver`: wires the
 * auto-merge Tauri command, SWR revalidation behind the recalculate button, the rebase-state
 * commit sha shown in the header statuses, and the app's shared lazy Monaco instance + dynamic
 * theme. All merge/diff behavior itself lives in the library component. */
export const ThreeWayMergeEditor = forwardRef<ThreeWayMergeEditorRef, ThreeWayMergeEditorProps>(
  ({ repoPath, filePath, view, original, modified, isTwoWay = false, onPendingCountChange, showBlockBorders = false }, ref) => {
    const { mutate } = useSWRConfig()
    const { data: rebaseState } = useRebaseState(repoPath)
    const theme = useSettingsStore((s) => s.settings.appearance.theme)

    // Re-register/apply the dynamic Monaco theme when the app theme changes — the panes
    // themselves are theme-agnostic, they just reference 'git-manager-dynamic' by name.
    const monacoRef = useRef<Monaco | null>(null)
    useEffect(() => {
      if (monacoRef.current) {
        registerAndApplyDynamicTheme(monacoRef.current)
      }
    }, [theme])

    const handleEditorMount = useCallback((_editor: unknown, monacoInstance: Monaco) => {
      monacoRef.current = monacoInstance
      registerAndApplyDynamicTheme(monacoInstance)
    }, [])

    const commitSha = useMemo(() => {
      if (rebaseState?.currentOid) {
        return rebaseState.currentOid.substring(0, 8)
      }
      return 'd6a30cec'
    }, [rebaseState])

    const fileName = useMemo(() => filePath.split('/').pop() || filePath, [filePath])

    const panels = useMemo<ConflictResolverPanel[]>(() => {
      if (isTwoWay) {
        return [{ content: original ?? '' }, { content: modified ?? '' }]
      }
      return [
        {
          content: view?.theirsText ?? '',
          status: (
            <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground/75">
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
              <span className="truncate">
                Rebasing <span className="font-mono text-foreground/90 font-medium">{commitSha}</span> from{' '}
                <strong className="text-foreground/95 font-semibold">theirs</strong>
              </span>
            </div>
          ),
        },
        {
          status: (
            <div className="truncate text-muted-foreground/70">
              <span className="text-foreground/95 font-semibold text-xs mr-1">Result</span>
              <span className="font-mono text-muted-foreground/85">{fileName}</span>
            </div>
          ),
        },
        {
          content: view?.oursText ?? '',
          status: (
            <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground/75">
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
              <span className="truncate">
                Already rebased commits and commits from{' '}
                <strong className="text-foreground/95 font-semibold">ours</strong>
              </span>
            </div>
          ),
        },
      ]
    }, [isTwoWay, original, modified, view, commitSha, fileName])

    const handleAutoMerge = useCallback(() => apiAutoMergeConflictView(repoPath, filePath), [repoPath, filePath])

    // Force recalculating/revalidating SWR keys
    const handleRecalculate = useCallback(() => {
      mutate(['merge-view', repoPath, filePath])
      mutate(['rebase-state', repoPath])
    }, [repoPath, filePath, mutate])

    const editorConfig = useMemo(
      () => ({
        component: MonacoEditor as unknown as CodePaneEditorComponent,
        language: languageForFilePath(filePath),
        theme: 'git-manager-dynamic',
        onEditorMount: handleEditorMount,
      }),
      [filePath, handleEditorMount]
    )

    return (
      <ConflictResolver
        ref={ref}
        panels={panels}
        blocks={view?.blocks}
        modelPathPrefix={isTwoWay ? filePath : `${repoPath}/${filePath}`}
        editor={editorConfig}
        onAutoMerge={handleAutoMerge}
        onRecalculate={handleRecalculate}
        onPendingCountChange={onPendingCountChange}
        showBlockBorders={showBlockBorders}
      />
    )
  }
)

ThreeWayMergeEditor.displayName = 'ThreeWayMergeEditor'
