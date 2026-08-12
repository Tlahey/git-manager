import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab, type MarkdownCommandId } from '@git-manager/components'
import { Markdown } from '../Markdown'
import { MarkdownFormattingBar } from './MarkdownFormattingBar'

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
  /** Notified when the switch moves, for a caller that measures the field and must not do it while
   * it is hidden — a hidden element reports a `scrollHeight` of 0. */
  onPreviewingChange?: (previewing: boolean) => void
}

/**
 * The chrome around a markdown editor: the code/preview switch, the formatting bar, and the
 * rendered preview.
 *
 * The editor is *hidden*, never unmounted, while the preview is up — unmounting a textarea throws
 * away its caret, its scroll position and its undo stack, so a glance at the preview would cost the
 * user everything ⌘Z could have given back. The preview is read-only by design: the stored format
 * is markdown, and editing the rendered output would mean serializing a document tree back to it on
 * every save, rewriting parts of the body nobody touched.
 */
export function MarkdownEditorFrame({
  value,
  onCommand,
  disabled,
  repoPath,
  authored,
  children,
  onPreviewingChange,
}: MarkdownEditorFrameProps) {
  const { t } = useTranslation('git')
  const [previewing, setPreviewing] = useState(false)

  function show(next: boolean) {
    setPreviewing(next)
    onPreviewingChange?.(next)
  }

  return (
    <div className="space-y-1" data-testid="markdown-editor-frame">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        <InnerTab
          active={!previewing}
          onClick={() => show(false)}
          className="py-1.5"
          data-testid="markdown-tab-code"
        >
          {t('markdown.tab.code')}
        </InnerTab>
        <InnerTab
          active={previewing}
          onClick={() => show(true)}
          className="py-1.5"
          data-testid="markdown-tab-preview"
        >
          {t('markdown.tab.preview')}
        </InnerTab>
        {!previewing && (
          <MarkdownFormattingBar onCommand={onCommand} disabled={disabled} className="ml-auto" />
        )}
      </div>

      <div className={previewing ? 'hidden' : undefined}>{children}</div>

      {previewing && (
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
