import type { DragEvent, KeyboardEvent } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  MarkdownLiveEditor,
  useMarkdownEditor,
  useMarkdownLiveEditor,
} from '@git-manager/components'
import { Textarea } from '@git-manager/ui'
import { resolveImageSrc } from '../markdown/components/resolveImageSrc'
import { MarkdownEditorFrame } from './MarkdownEditorFrame'

export interface MarkdownFieldProps {
  value: string
  onChange: (value: string) => void
  /** Set it when a `<label htmlFor>` points at the field. */
  id?: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  /** Applied to the textarea, not to the frame — callers size their own field. */
  className?: string
  autoFocus?: boolean
  onDragOver?: (event: DragEvent<HTMLTextAreaElement>) => void
  onDrop?: (event: DragEvent<HTMLTextAreaElement>) => void
  /** Runs after the formatting shortcuts, so a caller can add its own (⌘↵ to submit) without
   * shadowing them. */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  /** Passed to the preview so relative image paths resolve against the repository. */
  repoPath?: string
  /** Widens the preview's sanitiser to what the user may write themselves (board cards). */
  authored?: boolean
  /**
   * Adds the formatted editing tab — the same markdown, painted to look like the result, still
   * editable. Opt-in while it is being tried out on one surface rather than all nine.
   */
  rich?: boolean
  'data-testid'?: string
}

/**
 * A markdown textarea with its formatting bar and preview — the editor behind every place the app
 * writes markdown to GitHub: a pull request's description, an issue's, and the comment boxes.
 *
 * The field keeps `Textarea`'s own border and focus ring rather than being folded into the frame's
 * box, which is what an audited primitive is for. Board cards use `AttachmentTextarea` instead —
 * same frame, but that one also owns paste-to-attach.
 */
export function MarkdownField({
  value,
  onChange,
  id,
  placeholder,
  rows = 4,
  disabled,
  className = '',
  autoFocus,
  onDragOver,
  onDrop,
  onKeyDown,
  repoPath,
  authored,
  rich,
  'data-testid': testId,
}: MarkdownFieldProps) {
  const { t } = useTranslation('git')
  const { textareaRef, runCommand, handleKeyDown } = useMarkdownEditor(onChange)
  const live = useMarkdownLiveEditor()

  return (
    <MarkdownEditorFrame
      value={value}
      onCommand={runCommand}
      disabled={disabled}
      repoPath={repoPath}
      authored={authored}
      onRichCommand={live.runCommand}
      richEditor={
        rich ? (
          <MarkdownLiveEditor
            value={value}
            onChange={onChange}
            viewRef={live.viewRef}
            onCommand={live.runCommand}
            resolveImageSrc={(src) => resolveImageSrc(src, repoPath)}
            alertLabel={(kind) => t(`git:markdown.alert.${kind}`)}
            placeholder={placeholder}
            disabled={disabled}
            className={className}
            data-testid={testId ? `${testId}-rich` : undefined}
          />
        ) : undefined
      }
    >
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          handleKeyDown(event)
          onKeyDown?.(event)
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
        className={className}
        data-testid={testId}
      />
    </MarkdownEditorFrame>
  )
}
