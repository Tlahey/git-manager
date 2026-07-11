import { useEffect, useState } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { type InternalMergeView, buildDynamicMergeView } from '../twoWayView'

/** 2-panel mode's diff engine: feeds `original`/`modified` through a hidden, detached Monaco
 * diff editor and converts each `ILineChange` into the resolver's own block shape whenever the
 * diff settles. Re-runs (with a fresh diff editor) when either text or the whitespace mode
 * changes; inert in 3-panel mode. Returns `null` until the first diff result lands. */
export function useTwoWayDiffView(
  isTwoWay: boolean,
  monaco: Monaco | null,
  original: string | undefined,
  modified: string | undefined,
  whitespaceMode: 'compare' | 'ignore' | 'trim'
): InternalMergeView | null {
  const [dynamicView, setDynamicView] = useState<InternalMergeView | null>(null)

  useEffect(() => {
    if (!isTwoWay || !monaco || original === undefined || modified === undefined) return

    const originalModel = monaco.editor.createModel(original, undefined, monaco.Uri.parse(`inmemory://original-${Math.random()}`))
    const modifiedModel = monaco.editor.createModel(modified, undefined, monaco.Uri.parse(`inmemory://modified-${Math.random()}`))

    const container = document.createElement('div')
    const diffEditor = monaco.editor.createDiffEditor(container, {
      ignoreTrimWhitespace: whitespaceMode === 'ignore',
    })

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    })

    const disposable = diffEditor.onDidUpdateDiff(() => {
      const changes = diffEditor.getLineChanges() || []
      const parsedView = buildDynamicMergeView(original, changes)
      setDynamicView(parsedView)
    })

    return () => {
      disposable.dispose()
      diffEditor.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
    }
  }, [isTwoWay, monaco, original, modified, whitespaceMode])

  return dynamicView
}
