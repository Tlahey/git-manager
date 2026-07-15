import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'

interface PrSidebarSectionProps {
  title: string
  /** Optional edit handler — renders a pencil button in the header when provided (phase-2 editing). */
  onEdit?: () => void
  editTitle?: string
  testId?: string
  children: ReactNode
}

/** One labeled block in the PR side panel (Reviewers / Assignees / Labels / …), with a caption title,
 * an optional edit button, and a bottom divider. Keeps the panel's sections visually consistent. */
export function PrSidebarSection({
  title,
  onEdit,
  editTitle,
  testId,
  children,
}: PrSidebarSectionProps) {
  return (
    <section data-testid={testId} className="border-b border-border px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {onEdit && (
          <button
            onClick={onEdit}
            data-testid={testId ? `${testId}-edit` : undefined}
            title={editTitle}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
