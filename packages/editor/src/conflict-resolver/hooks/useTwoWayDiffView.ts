import { useEffect, useState } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { type InternalMergeView, buildDynamicMergeView } from '../twoWayView'

/** A settled 2-panel diff, carried together with the exact texts it describes.
 *
 * The pairing is the point: the diff is computed asynchronously (a detached Monaco diff editor
 * answering on `onDidUpdateDiff`), so between a file switch and the next result the view here
 * still describes the *previous* file. Handing the consumer both lets it render the pane contents
 * this geometry belongs to instead of the newer text it does not yet describe — otherwise the new
 * file paints with no blocks, hence no collapsed regions, and the collapse visibly snaps in a
 * moment later. */
export interface TwoWayDiffView {
  view: InternalMergeView
  original: string
  modified: string
}

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
): TwoWayDiffView | null {
  const [dynamicView, setDynamicView] = useState<TwoWayDiffView | null>(null)

  useEffect(() => {
    if (!isTwoWay || !monaco || original === undefined || modified === undefined) return

    const originalModel = monaco.editor.createModel(
      original,
      undefined,
      monaco.Uri.parse(`inmemory://original-${Math.random()}`)
    )
    const modifiedModel = monaco.editor.createModel(
      modified,
      undefined,
      monaco.Uri.parse(`inmemory://modified-${Math.random()}`)
    )

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
      setDynamicView({ view: parsedView, original, modified })
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
