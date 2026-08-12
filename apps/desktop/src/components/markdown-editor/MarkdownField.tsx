import type { DragEvent, KeyboardEvent } from 'react'
import {
  MarkdownLiveEditor,
  useMarkdownEditor,
  useMarkdownLiveEditor,
} from '@git-manager/components'
import { Textarea } from '@git-manager/ui'
import { resolveImageSrc } from '../markdown/components/resolveImageSrc'
import { renderMermaid } from '../markdown/components/renderMermaid'
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
  /** Resolves relative image paths against the repository, so an attachment is drawn rather than
   * left as its path. */
  repoPath?: string
  'data-testid'?: string
}

/**
 * A markdown editor in its two modes — formatted and raw — with the formatting bar over both. It is
 * behind every place the app writes markdown to GitHub: a pull request's description, an issue's,
 * and the comment boxes.
 *
 * The raw field keeps `Textarea`'s own border and focus ring rather than being folded into the
 * frame's box, which is what an audited primitive is for. Board cards use `AttachmentTextarea`
 * instead — same frame, but that one also owns paste-to-attach.
 *
 * **A commit message is not one of these, and the omission is deliberate.** The commit box, the
 * stash message, a reword, the batch plan, an annotated tag: git stores all of them as plain text,
 * so `**bold**` stays `**bold**` in `git log` and in GitHub's commit view alike. A formatting bar
 * there would promise a rendering that never arrives, and headings or tables would fight the 50/72
 * subject-and-body convention those fields exist to support. Adding `MarkdownField` to one of them
 * looks like fixing an oversight; it isn't.
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
  'data-testid': testId,
}: MarkdownFieldProps) {
  const { textareaRef, runCommand, handleKeyDown } = useMarkdownEditor(onChange)
  const live = useMarkdownLiveEditor()

  return (
    <MarkdownEditorFrame
      onCommand={runCommand}
      disabled={disabled}
      onRichCommand={live.runCommand}
      richEditor={
        <MarkdownLiveEditor
          value={value}
          onChange={onChange}
          viewRef={live.viewRef}
          onCommand={live.runCommand}
          resolveImageSrc={(src) => resolveImageSrc(src, repoPath)}
          renderDiagram={(code) => renderMermaid(code, 'cm-diagram')}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          data-testid={testId ? `${testId}-rich` : undefined}
        />
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
