import { useContext, type ChangeEvent } from 'react'
import { cn } from '@git-manager/ui'
import { MarkdownTaskItemLineContext, MarkdownTaskListContext } from '../taskListContext'

/**
 * A task-list checkbox. Read-only by default — the document is rendered, not a form — but becomes
 * clickable when the renderer was given a way to write the source back (a PR or issue description
 * the signed-in user can edit), so a reader can tick an item without opening the editor.
 */
export function MarkdownTaskListInput({ checked }: { checked?: boolean }) {
  const { onToggle, pending } = useContext(MarkdownTaskListContext)
  const line = useContext(MarkdownTaskItemLineContext)

  const toggle =
    onToggle && line !== null ? (next: boolean) => onToggle(line, next) : undefined

  // `disabled` alone would leave the toggle reachable while a save is in flight (a label click, or
  // any programmatic activation) — a second write against a body the server hasn't answered for yet.
  const handleChange =
    toggle && !pending
      ? (event: ChangeEvent<HTMLInputElement>) => toggle(event.currentTarget.checked)
      : undefined

  return (
    <input
      type="checkbox"
      checked={!!checked}
      disabled={!handleChange}
      // Without it React warns about a controlled checkbox that has no `onChange` to answer a click.
      readOnly={!handleChange}
      onChange={handleChange}
      className={cn(
        'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border text-primary accent-primary',
        toggle && 'cursor-pointer disabled:cursor-progress disabled:opacity-60'
      )}
      data-testid="markdown-task-checkbox"
    />
  )
}
