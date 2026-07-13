import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type * as monaco from 'monaco-editor'
import { cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { formatExactDate, formatShortDate } from '../../lib/relativeDate'
import { useFileBlame } from '../../hooks/useFileBlame'
import { useCommitAvatars } from '../../hooks/useCommitAvatars'
import { MonacoFileViewer } from './MonacoFileViewer'
import { blameBlocks, blameColorIndex, truncateCommitName, type BlameBlock } from './blameBlocks'
import { CommitAvatar } from './components/CommitAvatar'
import './blameGutter.css'

interface BlameFileViewerProps {
  repoPath: string
  filePath: string
  content: string
  /** Commit whose version is shown; blame is computed at this revision (HEAD when omitted). */
  oid?: string
  /** Blame mode: also show the commit name + date column to the right of the line numbers. */
  showBlame?: boolean
}

const DEFAULT_LINE_HEIGHT = 18
// Line-decorations margin width: room for the block bar (+ its gaps) in File view, and wide enough
// for the commit name (31 chars) + date + folding chevron in Blame mode. Monaco reserves this and
// shifts the code right.
const BORDER_MARGIN = 16
const BLAME_MARGIN = 300

/**
 * Read-only Monaco "File" view annotated with git blame. Every contiguous same-commit block gets a
 * colored border (a Monaco line-decoration between the line numbers and the code) and a square author
 * avatar in a strip left of the line numbers. In blame mode the widened decorations margin also holds
 * a "commit name · date" column (a scroll-synced React overlay, since Monaco's gutter can't host it).
 * Hovering an avatar shows the commit; clicking it opens that commit in the History panel.
 */
export function BlameFileViewer({
  repoPath,
  filePath,
  content,
  oid,
  showBlame = false,
}: BlameFileViewerProps) {
  const { i18n } = useTranslation('git')
  const setSelectedHistoryOid = useRepoUIStore((s) => s.setSelectedHistoryOid)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const rafRef = useRef<number | null>(null)

  const [ready, setReady] = useState(false)
  const [, setTick] = useState(0)
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT)
  const [hovered, setHovered] = useState<{ block: BlameBlock; top: number } | null>(null)

  const { data: hunks } = useFileBlame(repoPath, filePath, oid)
  const blocks = useMemo(() => (hunks ? blameBlocks(hunks) : []), [hunks])
  const shas = useMemo(() => blocks.map((b) => b.commitOid), [blocks])
  const avatars = useCommitAvatars(repoPath, shas)

  const optionsOverride = useMemo(
    () => ({
      glyphMargin: false,
      lineDecorationsWidth: showBlame ? BLAME_MARGIN : BORDER_MARGIN,
    }),
    [showBlame]
  )

  const scheduleTick = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const editor = editorRef.current
      const m = monacoRef.current
      if (editor && m) setLineHeight(editor.getOption(m.editor.EditorOption.lineHeight))
      setTick((t) => t + 1)
    })
  }, [])

  // Redraw the colored per-block borders whenever the blocks or the mode change. In blame mode the
  // border sits on the right of the (widened) margin, i.e. between the text column and the code.
  useEffect(() => {
    const editor = editorRef.current
    const m = monacoRef.current
    if (!editor || !m) return
    const side = showBlame ? 'blame-right' : 'blame-left'
    const decos = blocks.map((block) => ({
      range: new m.Range(block.startLine, 1, block.endLine, 1),
      options: {
        linesDecorationsClassName: `blame-c-${blameColorIndex(block.commitOid)} ${side}`,
      },
    }))
    if (!decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection(decos)
    } else {
      decorationsRef.current.set(decos)
    }
  }, [blocks, ready, showBlame])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, m: typeof monaco) => {
      editorRef.current = editor
      monacoRef.current = m
      setLineHeight(editor.getOption(m.editor.EditorOption.lineHeight))
      editor.onDidScrollChange(scheduleTick)
      editor.onDidLayoutChange(scheduleTick)
      setReady(true)
    },
    [scheduleTick]
  )

  function handleAvatarClick(commitOid: string) {
    setActiveLeftPanel('history')
    setSelectedHistoryOid(commitOid)
  }

  // Vertical offset of a block's first line relative to the viewport, or null when scrolled away.
  function topForBlock(startLine: number): number | null {
    const editor = editorRef.current
    const m = monacoRef.current
    if (!editor || !m) return null
    const top = editor.getTopForLineNumber(startLine) - editor.getScrollTop()
    const layout = editor.getLayoutInfo()
    if (top < -lineHeight || top > layout.height) return null
    return top
  }

  const layout = ready ? editorRef.current?.getLayoutInfo() : undefined

  return (
    <div className="relative flex h-full w-full overflow-hidden" data-testid="blame-file-viewer">
      {/* Avatar strip — a scroll-synced overlay to the left of Monaco's line numbers. */}
      <div
        className="relative shrink-0 overflow-hidden border-r border-border/30 bg-card/30"
        style={{ width: lineHeight }}
        data-testid="blame-gutter"
      >
        {ready &&
          blocks.map((block) => {
            const top = topForBlock(block.startLine)
            if (top === null) return null
            const name = block.authorName || block.authorEmail || '?'
            return (
              <button
                key={`${block.commitOid}-${block.startLine}`}
                type="button"
                data-testid={`blame-avatar-${block.shortOid}`}
                onClick={() => handleAvatarClick(block.commitOid)}
                onMouseEnter={() => setHovered({ block, top })}
                onMouseLeave={() => setHovered(null)}
                className="absolute left-0"
                style={{ top }}
              >
                <CommitAvatar
                  avatarUrl={avatars[block.commitOid]}
                  name={name}
                  size={lineHeight}
                  square
                  title=""
                />
              </button>
            )
          })}
      </div>

      <div className={cn('relative min-w-0 flex-1', showBlame && 'blame-mode')}>
        <MonacoFileViewer
          content={content}
          filePath={filePath}
          onMount={handleMount}
          optionsOverride={optionsOverride}
        />

        {/* Blame text column — commit name + date over the widened decorations margin. */}
        {showBlame &&
          ready &&
          layout &&
          blocks.map((block) => {
            const top = topForBlock(block.startLine)
            if (top === null) return null
            return (
              <div
                key={`blame-text-${block.commitOid}-${block.startLine}`}
                data-testid={`blame-annotation-${block.shortOid}`}
                className="pointer-events-none absolute flex items-center gap-2 overflow-hidden whitespace-nowrap pl-5 font-mono text-[11px] text-muted-foreground"
                style={{
                  top,
                  height: lineHeight,
                  left: layout.decorationsLeft,
                  // Stop short of the border bar (~28px from the margin's right edge) so the text and
                  // date don't hug the separator.
                  width: Math.max(0, layout.decorationsWidth - 40),
                }}
              >
                <span className="truncate">{truncateCommitName(block.summary)}</span>
                <span className="ml-auto shrink-0 text-muted-foreground/70">
                  {formatShortDate(block.timestamp, i18n.language)}
                </span>
              </div>
            )
          })}
      </div>

      {/* Commit info popover shown while hovering an avatar. */}
      {hovered && (
        <div
          data-testid="blame-popover"
          className="animate-in fade-in pointer-events-none absolute z-20 max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg duration-100"
          style={{ top: Math.max(4, hovered.top), left: lineHeight + 8 }}
        >
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {hovered.block.authorName || hovered.block.authorEmail || '?'}
            </span>
            <span>·</span>
            <span className="font-mono text-primary/80">{hovered.block.shortOid}</span>
            <span>·</span>
            <span>{formatExactDate(hovered.block.timestamp, i18n.language)}</span>
          </div>
          <div className="font-medium text-foreground">
            {hovered.block.summary || '(no message)'}
          </div>
          {hovered.block.body && (
            <div className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
              {hovered.block.body}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
