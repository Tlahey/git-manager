import { useRef, type MutableRefObject } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

/** All the per-pane imperative Monaco handles the resolver juggles, bundled in one stable
 * object so the extracted hooks can share them without ten separate ref parameters each.
 * Everything here is plain ref bookkeeping — never read during render. */
export interface MergeEditorRefs {
  monacoRef: MutableRefObject<Monaco | null>
  oursEditorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  centerEditorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  theirsEditorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  oursDecorationsRef: MutableRefObject<editor.IEditorDecorationsCollection | null>
  centerDecorationsRef: MutableRefObject<editor.IEditorDecorationsCollection | null>
  theirsDecorationsRef: MutableRefObject<editor.IEditorDecorationsCollection | null>
  /** Ids of the currently-injected alignment view zones per pane (see applyViewZones) — pure
   * bookkeeping for the next wholesale replacement. */
  oursZoneIdsRef: MutableRefObject<string[]>
  centerZoneIdsRef: MutableRefObject<string[]>
  theirsZoneIdsRef: MutableRefObject<string[]>
  /** Bookkeeping for the collapsed-region banner view zones. */
  oursCollapsedViewZonesRef: MutableRefObject<string[]>
  centerCollapsedViewZonesRef: MutableRefObject<string[]>
  theirsCollapsedViewZonesRef: MutableRefObject<string[]>
}

export function useMergeEditorRefs(): MergeEditorRefs {
  const monacoRef = useRef<Monaco | null>(null)
  const oursEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const centerEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const theirsEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const oursDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const centerDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const theirsDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  const oursZoneIdsRef = useRef<string[]>([])
  const centerZoneIdsRef = useRef<string[]>([])
  const theirsZoneIdsRef = useRef<string[]>([])

  const oursCollapsedViewZonesRef = useRef<string[]>([])
  const centerCollapsedViewZonesRef = useRef<string[]>([])
  const theirsCollapsedViewZonesRef = useRef<string[]>([])

  // One stable identity for the whole bundle — refs never change, so neither does the object.
  const bundleRef = useRef<MergeEditorRefs | null>(null)
  if (!bundleRef.current) {
    bundleRef.current = {
      monacoRef,
      oursEditorRef,
      centerEditorRef,
      theirsEditorRef,
      oursDecorationsRef,
      centerDecorationsRef,
      theirsDecorationsRef,
      oursZoneIdsRef,
      centerZoneIdsRef,
      theirsZoneIdsRef,
      oursCollapsedViewZonesRef,
      centerCollapsedViewZonesRef,
      theirsCollapsedViewZonesRef,
    }
  }
  return bundleRef.current
}
