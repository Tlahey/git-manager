import { useLayoutEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useMarkdownEditor } from '@git-manager/components'
import { Textarea, toast } from '@git-manager/ui'
import { Paperclip } from 'lucide-react'
import { MarkdownEditorFrame } from '../../../components/markdown-editor/MarkdownEditorFrame'
import { saveBoardAttachment } from '../api/attachment.api'
import { attachmentMarkdown, insertAtCaret } from '../lib/attachmentMarkdown'

interface AttachmentTextareaProps {
  value: string
  onChange: (value: string) => void
  /**
   * Grows the field to fit its content instead of scrolling inside a fixed box.
   *
   * Used where the editor replaces rendered text in place (a card's description): a fixed-height box
   * is a different height from the paragraph it covers, so opening the editor shifts everything
   * below it. `rows` then acts as the minimum.
   */
  autoGrow?: boolean
  repoPath: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
  'data-testid'?: string
  /** Set for a GitHub-backed board: makes inserted attachments absolute `raw.githubusercontent.com`
   * URLs, since GitHub doesn't resolve relative image paths in issue bodies. */
  attachmentUrlPrefix?: string
}

/**
 * A markdown textarea that accepts pasted or dropped files, writing them into the repository's
 * `.git-manager/attachments/` and inserting the reference at the caret.
 *
 * Used for both a card's description and its comment box — the two places a user writes prose about
 * a card — which is why it lives here rather than in `packages/ui`: it talks to the board API and
 * needs the repository path, so it isn't the domain-agnostic primitive that package holds.
 */
export function AttachmentTextarea({
  value,
  onChange,
  repoPath,
  placeholder,
  rows = 6,
  disabled,
  className = '',
  attachmentUrlPrefix,
  autoGrow,
  'data-testid': testId,
}: AttachmentTextareaProps) {
  const { t } = useTranslation('board')
  // The formatting bar drives the same element the attachment logic reads the caret from, so both
  // share the hook's ref rather than keeping one each.
  const { textareaRef, runCommand, handleKeyDown } = useMarkdownEditor(onChange)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  // True whenever the raw field is off screen (preview, or the formatted editor).
  const [hidden, setHidden] = useState(false)

  // Measured after every value change rather than tracked in state: the height has to be read back
  // from the laid-out element, and `scrollHeight` is only meaningful once the box has been collapsed
  // to `auto` first — which a hidden element cannot give, since it reports 0. Hence `hidden` both as
  // a guard and as a dependency: the measurement is deferred to the moment the field comes back on
  // screen, rather than collapsing it to nothing behind another tab.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!autoGrow || !el || hidden) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, autoGrow, hidden])

  async function attach(files: File[]) {
    if (files.length === 0 || disabled) return
    setUploading(true)
    try {
      // Sequential rather than parallel: each insertion depends on where the previous one left the
      // text, and two concurrent writes would race over the same `value`.
      let next = value
      let caret = textareaRef.current?.selectionStart ?? value.length
      let caretEnd = textareaRef.current?.selectionEnd ?? caret
      for (const file of files) {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
        const relativePath = await saveBoardAttachment(repoPath, file.name, bytes)
        const snippet = attachmentMarkdown(relativePath, file.name, attachmentUrlPrefix)
        const result = insertAtCaret(next, snippet, caret, caretEnd)
        next = result.value
        caret = result.caret
        caretEnd = result.caret
      }
      onChange(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('attachment.failed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <MarkdownEditorFrame
      value={value}
      onCommand={runCommand}
      disabled={disabled || uploading}
      repoPath={repoPath}
      authored
      onModeChange={(mode) => setHidden(mode !== 'code')}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled || uploading}
        className={`${className} ${dragging ? 'border-primary' : ''} ${
          autoGrow ? 'resize-none overflow-hidden' : ''
        }`}
        data-testid={testId}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.length > 0) {
            // Let a plain text paste through untouched — only a file paste is ours to handle.
            e.preventDefault()
            void attach(files)
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files)
          setDragging(false)
          if (files.length > 0) {
            e.preventDefault()
            void attach(files)
          }
        }}
      />
      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Paperclip className="h-2.5 w-2.5" />
        {uploading
          ? t('attachment.saving')
          : attachmentUrlPrefix
            ? t('attachment.hintRemote')
            : t('attachment.hint')}
      </p>
    </MarkdownEditorFrame>
  )
}
