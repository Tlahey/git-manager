import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab, type MarkdownCommandId } from '@git-manager/components'
import { Markdown } from '../Markdown'
import { MarkdownFormattingBar } from './MarkdownFormattingBar'

/** `code` is the markdown as typed, `rich` the same markdown painted to look like the result, and
 * `preview` the rendered output, read-only. */
export type MarkdownEditorMode = 'code' | 'rich' | 'preview'

interface MarkdownEditorFrameProps {
  /** The markdown being edited — what the preview renders. */
  value: string
  onCommand: (command: MarkdownCommandId) => void
  disabled?: boolean
  /** Passed to the preview so relative image paths resolve against the repository. */
  repoPath?: string
  /** Widens the preview's sanitiser to what the user is allowed to write themselves (board cards). */
  authored?: boolean
  /** The editor itself. */
  children: ReactNode
  /** The formatted editing surface. Omit it and the field keeps the two original tabs. */
  richEditor?: ReactNode
  /** Runs a command against `richEditor` — a different editor needs a different way in. */
  onRichCommand?: (command: MarkdownCommandId) => void
  /** Notified when the switch moves, for a caller that measures the field and must not do it while
   * it is hidden — a hidden element reports a `scrollHeight` of 0. */
  onModeChange?: (mode: MarkdownEditorMode) => void
}

/**
 * The chrome around a markdown editor: the mode switch, the formatting bar, and the rendered
 * preview.
 *
 * Every editor is *hidden*, never unmounted, while another mode is up — unmounting a textarea
 * throws away its caret, its scroll position and its undo stack, so a glance at the preview would
 * cost the user everything ⌘Z could have given back. Both editors work on the same markdown string
 * held by the caller, so switching tabs mid-sentence carries the text over untouched; the toolbar
 * simply addresses whichever one is on screen.
 *
 * The preview stays read-only, and that is the same decision as the toolbar's: editing rendered
 * output means serializing a document tree back to markdown on every save, rewriting parts of the
 * body nobody touched. The `rich` mode is what makes formatted editing possible without it — the
 * document there *is* the markdown, only painted (see `markdownLivePreview`).
 */
export function MarkdownEditorFrame({
  value,
  onCommand,
  disabled,
  repoPath,
  authored,
  children,
  richEditor,
  onRichCommand,
  onModeChange,
}: MarkdownEditorFrameProps) {
  const { t } = useTranslation('git')
  const [mode, setMode] = useState<MarkdownEditorMode>('code')

  function show(next: MarkdownEditorMode) {
    setMode(next)
    onModeChange?.(next)
  }

  return (
    <div className="space-y-1" data-testid="markdown-editor-frame">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        <InnerTab
          active={mode === 'code'}
          onClick={() => show('code')}
          className="py-1.5"
          data-testid="markdown-tab-code"
        >
          {t('markdown.tab.code')}
        </InnerTab>
        {richEditor && (
          <InnerTab
            active={mode === 'rich'}
            onClick={() => show('rich')}
            className="py-1.5"
            data-testid="markdown-tab-rich"
          >
            {t('markdown.tab.rich')}
          </InnerTab>
        )}
        <InnerTab
          active={mode === 'preview'}
          onClick={() => show('preview')}
          className="py-1.5"
          data-testid="markdown-tab-preview"
        >
          {t('markdown.tab.preview')}
        </InnerTab>
        {mode !== 'preview' && (
          <MarkdownFormattingBar
            onCommand={mode === 'rich' && onRichCommand ? onRichCommand : onCommand}
            disabled={disabled}
            className="ml-auto"
          />
        )}
      </div>

      <div className={mode === 'code' ? undefined : 'hidden'}>{children}</div>
      {richEditor && <div className={mode === 'rich' ? undefined : 'hidden'}>{richEditor}</div>}

      {mode === 'preview' && (
        <div
          className="min-h-[60px] rounded-md border border-input px-3 py-2"
          data-testid="markdown-preview"
        >
          {value.trim() ? (
            <Markdown content={value} repoPath={repoPath} authored={authored} />
          ) : (
            <p className="text-xs text-muted-foreground italic">{t('markdown.preview.empty')}</p>
          )}
        </div>
      )}
    </div>
  )
}
