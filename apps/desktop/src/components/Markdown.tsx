import { MarkdownRenderer, type MarkdownRendererProps } from './markdown/MarkdownRenderer'

export interface MarkdownProps extends MarkdownRendererProps {}

export function Markdown({
  content,
  className,
  repoPath,
  onTaskToggle,
  taskTogglePending,
}: MarkdownProps) {
  return (
    <MarkdownRenderer
      content={content}
      className={className}
      repoPath={repoPath}
      onTaskToggle={onTaskToggle}
      taskTogglePending={taskTogglePending}
    />
  )
}
