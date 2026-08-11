import { useEffect, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'
import { type InternalMergeView, buildDynamicMergeView } from '../twoWayView'

// Typed against monaco-editor's own root export rather than `@monaco-editor/react`'s `Monaco`
// type — see the comment in `useMergeScrollSync.ts` for why.
type Monaco = typeof monaco

/** A settled 2-panel diff, carried together with the exact texts it describes — and with the model
 * path prefix those texts belong to.
 *
 * The pairing is the point: the diff is computed asynchronously (a detached Monaco diff editor
 * answering on `onDidUpdateDiff`), so between a file switch and the next result the view here
 * still describes the *previous* file. Handing the consumer all three lets it render the pane
 * contents this geometry belongs to instead of the newer text it does not yet describe — otherwise
 * the new file paints with no blocks, hence no collapsed regions, and the collapse visibly snaps in
 * a moment later.
 *
 * `modelPathPrefix` is in here for a sharper reason than symmetry. It names the Monaco *models* the
 * panes attach to, and swapping a model destroys the view model with it — which is where hidden
 * areas live (`codeEditorWidget`'s `setHiddenAreas` delegates to `viewModel`) and what owns the view
 * zones ("View zones are lost when a new model is attached to the editor", per Monaco's own API
 * docs). Taken straight from props, the prefix changes the instant the user clicks another file,
 * i.e. while this view — and the text on screen — is still the previous one: the panes would swap
 * models there and then, dropping the collapse and leaving the *old* file on screen fully expanded,
 * with its fold banners floating, for as long as the new file's contents and diff take to arrive.
 * Carrying the prefix through here means the model swap happens in the same commit as the text and
 * the geometry, and never on its own. */
export interface TwoWayDiffView {
  view: InternalMergeView
  original: string
  modified: string
  modelPathPrefix: string
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
  whitespaceMode: 'compare' | 'ignore' | 'trim',
  modelPathPrefix: string
): TwoWayDiffView | null {
  const [dynamicView, setDynamicView] = useState<TwoWayDiffView | null>(null)

  /* Read at compute time, deliberately NOT a dependency below. The prefix changes when the user
   * picks another file, which is *before* that file's text arrives (the host keeps the previous
   * contents on screen while it fetches). Re-running on it would answer a diff for the previous
   * text under the next file's name — publishing exactly the mismatched pair this bundle exists to
   * prevent, and swapping the panes' models onto the old text. The prefix that matters is the one in
   * effect when a text lands, so it is sampled here and shipped with the result. */
  const modelPathPrefixRef = useRef(modelPathPrefix)
  modelPathPrefixRef.current = modelPathPrefix

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
      setDynamicView({
        view: parsedView,
        original,
        modified,
        modelPathPrefix: modelPathPrefixRef.current,
      })
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
