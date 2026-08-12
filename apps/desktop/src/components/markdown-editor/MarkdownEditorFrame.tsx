import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab, type MarkdownCommandId } from '@git-manager/components'
import { MarkdownFormattingBar } from './MarkdownFormattingBar'

/** `code` is the markdown as typed; `rich` is the same markdown painted to look like its result. */
export type MarkdownEditorMode = 'code' | 'rich'

interface MarkdownEditorFrameProps {
  onCommand: (command: MarkdownCommandId) => void
  disabled?: boolean
  /** The raw editor. */
  children: ReactNode
  /** The formatted editing surface. */
  richEditor: ReactNode
  /** Runs a command against `richEditor` — a different editor needs a different way in. */
  onRichCommand: (command: MarkdownCommandId) => void
  /** Notified when the switch moves, for a caller that measures the raw field and must not do it
   * while it is hidden — a hidden element reports a `scrollHeight` of 0. */
  onModeChange?: (mode: MarkdownEditorMode) => void
}

/**
 * The chrome around a markdown editor: the mode switch and the formatting bar.
 *
 * Both editors hold the same markdown string, owned by the caller, so switching mid-sentence
 * carries the text over untouched and the toolbar simply addresses whichever one is on screen. The
 * one that isn't is *hidden*, never unmounted — unmounting a textarea throws away its caret, its
 * scroll position and its undo stack, so a glance at the other mode would cost the user everything
 * ⌘Z could have given back.
 *
 * There is no read-only preview tab any more: the formatted mode renders what a preview would show
 * — headings, images, tables, alerts, diagrams — and stays editable, so a third tab would have been
 * the same document a third time. What it deliberately doesn't render is raw HTML (`<details>`,
 * `<sub>`), footnote numbering and `:emoji:` shortcodes, which stay as source in both modes.
 */
export function MarkdownEditorFrame({
  onCommand,
  disabled,
  children,
  richEditor,
  onRichCommand,
  onModeChange,
}: MarkdownEditorFrameProps) {
  const { t } = useTranslation('git')
  const [mode, setMode] = useState<MarkdownEditorMode>('rich')

  function show(next: MarkdownEditorMode) {
    setMode(next)
    onModeChange?.(next)
  }

  return (
    <div className="space-y-1" data-testid="markdown-editor-frame">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        <InnerTab
          active={mode === 'rich'}
          onClick={() => show('rich')}
          className="py-1.5"
          data-testid="markdown-tab-rich"
        >
          {t('markdown.tab.rich')}
        </InnerTab>
        <InnerTab
          active={mode === 'code'}
          onClick={() => show('code')}
          className="py-1.5"
          data-testid="markdown-tab-code"
        >
          {t('markdown.tab.code')}
        </InnerTab>
        <MarkdownFormattingBar
          onCommand={mode === 'rich' ? onRichCommand : onCommand}
          disabled={disabled}
          className="ml-auto"
        />
      </div>

      <div className={mode === 'code' ? undefined : 'hidden'}>{children}</div>
      <div className={mode === 'rich' ? undefined : 'hidden'}>{richEditor}</div>
    </div>
  )
}
