import type { DragEvent, KeyboardEvent } from 'react'
import { useMarkdownEditor } from '@git-manager/components'
import { Textarea } from '@git-manager/ui'
import { MarkdownFormattingBar } from './MarkdownFormattingBar'

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
  'data-testid'?: string
}

/**
 * A markdown textarea with its formatting bar — the editor behind every place the app writes
 * markdown to GitHub: a pull request's description, an issue's, and the comment boxes.
 *
 * The bar sits above the field rather than inside a shared frame on purpose: the field keeps
 * `Textarea`'s own border and focus ring, which is what an audited primitive is for. Board cards
 * use `AttachmentTextarea` instead — same bar, but that one also owns paste-to-attach.
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
  'data-testid': testId,
}: MarkdownFieldProps) {
  const { textareaRef, runCommand, handleKeyDown } = useMarkdownEditor(onChange)

  return (
    <div className="space-y-1">
      <MarkdownFormattingBar onCommand={runCommand} disabled={disabled} />
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
    </div>
  )
}
