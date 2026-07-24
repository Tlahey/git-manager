

export function MarkdownTaskListInput({ checked }: { checked?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={!!checked}
      disabled
      readOnly
      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border text-primary accent-primary"
      data-testid="markdown-task-checkbox"
    />
  )
}

