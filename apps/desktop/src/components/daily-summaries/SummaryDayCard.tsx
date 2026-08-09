import { useTranslation } from '@git-manager/i18n'
import { CheckCircle2, FileCode2, FolderOpen, Trash2, GitCommit } from 'lucide-react'
import { Button, Tooltip, Badge } from '@git-manager/ui'
import type { StoredDailySummary } from '../../stores/dailySummary.store'

interface SummaryDayCardProps {
  entry: StoredDailySummary
  onOpenInEditor: (entry: StoredDailySummary) => void
  onReveal: () => void
  onDelete: (entry: StoredDailySummary) => void
}

/**
 * One archived day: its date, headline, both bullet lists, and the actions that act on the markdown
 * file it came from.
 *
 * The card carries its own date rather than sitting under a shared day heading, because the panel is
 * scoped to one repository — one day is one card, so a heading grouping a single card each time
 * would be pure chrome in a pane this narrow.
 *
 * Rendered from the parsed entry rather than the raw markdown, so query matches can be highlighted
 * line by line.
 */
export function SummaryDayCard({ entry, onOpenInEditor, onReveal, onDelete }: SummaryDayCardProps) {
  const { t, i18n } = useTranslation('dashboard')

  // Parsed at local noon so the label can't slip a day in a negative-offset time zone.
  const dateLabel = new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <article
      className="rounded-lg border border-border bg-card/60 p-3"
      data-testid={`summary-card-${entry.date}`}
    >
      <header className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-xs font-semibold text-foreground capitalize">
              {dateLabel}
            </h3>
            <Badge variant="outline" className="text-[10px]">
              {entry.branch}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {entry.summary.headline}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip content={t('summaries.openInEditor')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => onOpenInEditor(entry)}
              aria-label={t('summaries.openInEditor')}
              data-testid="summary-open-in-editor"
            >
              <FileCode2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content={t('summaries.revealInFinder')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onReveal}
              aria-label={t('summaries.revealInFinder')}
              data-testid="summary-reveal"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content={t('summaries.delete')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(entry)}
              aria-label={t('summaries.delete')}
              data-testid="summary-delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </header>

      <CardSection
        icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        title={t('dashboard.summary.highlights')}
        items={entry.summary.highlights}
        emptyLabel={t('dashboard.summary.noHighlights')}
      />

      <footer className="mt-2.5 flex items-center gap-1.5 border-t border-border/40 pt-2 text-[10px] text-muted-foreground/70">
        <GitCommit className="h-3 w-3" />
        {t('summaries.provenance', { commits: entry.commitCount, files: entry.fileCount })}
      </footer>
    </article>
  )
}

interface CardSectionProps {
  icon: React.ReactNode
  title: string
  items: string[]
  emptyLabel: string
}

function CardSection({ icon, title, items, emptyLabel }: CardSectionProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <h4 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">
          {title}
        </h4>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
