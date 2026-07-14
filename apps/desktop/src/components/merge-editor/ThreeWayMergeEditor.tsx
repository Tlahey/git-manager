import { forwardRef, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { Lock } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { ThreeWayMergeView } from '@git-manager/git-types'
import {
  ConflictResolver,
  registerAndApplyDynamicTheme,
  MonacoEditor,
  languageForFilePath,
  type ConflictResolverPanel,
  type ConflictResolverRef,
  type ConflictResolverLabels,
  type CodePaneEditorComponent,
} from '@git-manager/editor'
import { useSWRConfig } from 'swr'
import { apiAutoMergeConflictView } from '../../api/conflict.api'
import { useRebaseState } from '../../hooks/useRebaseState'
import { useSettingsStore } from '../../stores/settings.store'

interface ThreeWayMergeEditorProps {
  repoPath: string
  filePath: string
  view?: ThreeWayMergeView
  original?: string
  modified?: string
  isTwoWay?: boolean
  /** Status label shown above the left (original) pane in two-way mode — e.g. the fixup target
   * commit's sha. Ignored in 3-panel mode (those statuses are built in below). */
  originalLabel?: ReactNode
  /** Status label shown above the right (modified) pane in two-way mode. */
  modifiedLabel?: ReactNode
  onPendingCountChange?: (count: number) => void
  /** Draw the JetBrains-style hermetic 2px top/bottom edges around each block (and the matching
   * closing edges on the hatched filler zones). Off by default — the colored fills alone. */
  showBlockBorders?: boolean
  /** Initial collapse-unchanged state — the library's own header toggle controls it from there. */
  defaultCollapseUnchanged?: boolean
}

export type ThreeWayMergeEditorRef = ConflictResolverRef

/** App-side binding of `@git-manager/editor`'s generic `ConflictResolver`: wires the
 * auto-merge Tauri command, SWR revalidation behind the recalculate button, the rebase-state
 * commit sha shown in the header statuses, and the app's shared lazy Monaco instance + dynamic
 * theme. All merge/diff behavior itself lives in the library component. */
export const ThreeWayMergeEditor = forwardRef<ThreeWayMergeEditorRef, ThreeWayMergeEditorProps>(
  (
    {
      repoPath,
      filePath,
      view,
      original,
      modified,
      isTwoWay = false,
      originalLabel,
      modifiedLabel,
      onPendingCountChange,
      showBlockBorders = false,
      defaultCollapseUnchanged,
    },
    ref
  ) => {
    const { t } = useTranslation('git')
    const { mutate } = useSWRConfig()
    const { data: rebaseState } = useRebaseState(repoPath)
    const theme = useSettingsStore((s) => s.settings.appearance.theme)
    const stickyScroll = useSettingsStore((s) => s.settings.appearance.stickyScroll ?? false)

    const labels = useMemo<ConflictResolverLabels>(
      () => ({
        navPrevTitle: t('mergeEditor.navPrevTitle'),
        navNextTitle: t('mergeEditor.navNextTitle'),
        applyAllIconTitle: t('mergeEditor.applyNonConflictingAllTitle'),
        applyNonConflictingText: t('mergeEditor.applyNonConflictingLabel'),
        applyLeftLabel: t('mergeEditor.applyLeft'),
        applyAllLabel: t('mergeEditor.applyAll'),
        applyRightLabel: t('mergeEditor.applyRight'),
        autoMergeTitle: t('mergeEditor.autoMergeTitle'),
        collapseUnchangedTitle: t('mergeEditor.collapseUnchangedTitle'),
        resetTitle: t('mergeEditor.resetTitle'),
        recalculateTitle: t('mergeEditor.recalculateTitle'),
        whitespace: {
          compare: t('mergeEditor.whitespaceCompare'),
          ignore: t('mergeEditor.whitespaceIgnore'),
          trim: t('mergeEditor.whitespaceTrim'),
        },
        highlight: {
          words: t('mergeEditor.highlightWords'),
          lines: t('mergeEditor.highlightLines'),
        },
        changesLabel: (count) => t('mergeEditor.changesCount', { count }),
        conflictsLabel: (count) => t('mergeEditor.conflictsCount', { count }),
      }),
      [t]
    )

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
        return [
          { content: original ?? '', status: originalLabel },
          { content: modified ?? '', status: modifiedLabel },
        ]
      }
      return [
        {
          content: view?.theirsText ?? '',
          status: (
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground/75">
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
              <span className="truncate">
                Rebasing{' '}
                <span
                  data-testid="merge-rebase-commit-sha"
                  className="font-mono font-medium text-foreground/90"
                >
                  {commitSha}
                </span>{' '}
                from{' '}
                <strong className="font-semibold text-foreground/95">theirs</strong>
              </span>
            </div>
          ),
        },
        {
          status: (
            <div className="truncate text-muted-foreground/70">
              <span className="mr-1 text-xs font-semibold text-foreground/95">Result</span>
              <span className="font-mono text-muted-foreground/85">{fileName}</span>
            </div>
          ),
        },
        {
          content: view?.oursText ?? '',
          status: (
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground/75">
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
              <span className="truncate">
                Already rebased commits and commits from{' '}
                <strong className="font-semibold text-foreground/95">ours</strong>
              </span>
            </div>
          ),
        },
      ]
    }, [isTwoWay, original, modified, originalLabel, modifiedLabel, view, commitSha, fileName])

    const handleAutoMerge = useCallback(
      () => apiAutoMergeConflictView(repoPath, filePath),
      [repoPath, filePath]
    )

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
        options: { stickyScroll: { enabled: stickyScroll } },
      }),
      [filePath, handleEditorMount, stickyScroll]
    )

    return (
      <ConflictResolver
        ref={ref}
        panels={panels}
        blocks={view?.blocks}
        modelPathPrefix={isTwoWay ? filePath : `${repoPath}/${filePath}`}
        editor={editorConfig}
        labels={labels}
        onAutoMerge={handleAutoMerge}
        onRecalculate={handleRecalculate}
        onPendingCountChange={onPendingCountChange}
        showBlockBorders={showBlockBorders}
        defaultCollapseUnchanged={defaultCollapseUnchanged}
      />
    )
  }
)

ThreeWayMergeEditor.displayName = 'ThreeWayMergeEditor'
