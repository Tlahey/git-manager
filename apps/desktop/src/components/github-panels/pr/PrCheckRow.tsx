import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { Check, X, MinusCircle, Circle } from 'lucide-react'
import type { PrCheck, PrCheckCategory } from '../../../api/github.api'

function CategoryIcon({ category }: { category: PrCheckCategory }) {
  switch (category) {
    case 'success':
      return <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
    case 'failure':
      return <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
    case 'in_progress':
      return <Spinner className="h-3.5 w-3.5 shrink-0 text-amber-500" />
    case 'skipped':
      return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    default:
      return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  }
}

const CATEGORY_LABEL: Record<PrCheckCategory, string> = {
  success: 'pr.checks.status.success',
  failure: 'pr.checks.status.failure',
  in_progress: 'pr.checks.status.inProgress',
  skipped: 'pr.checks.status.skipped',
  neutral: 'pr.checks.status.neutral',
}

/** One check row inside the merge box: status icon, app + name (linked to its run), a "Required"
 * badge when branch protection requires it, and the status word. Mirrors GitHub's per-check row. */
export function PrCheckRow({ check }: { check: PrCheck }) {
  const { t } = useTranslation('git')

  return (
    <li
      data-testid={`pr-check-${check.name}`}
      className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
    >
      <CategoryIcon category={check.category} />
      {check.appName && <span className="shrink-0 text-muted-foreground">{check.appName}</span>}
      {check.url ? (
        <a
          href={check.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-foreground hover:text-primary hover:underline"
        >
          {check.name}
        </a>
      ) : (
        <span className="truncate text-foreground">{check.name}</span>
      )}
      <span className="shrink-0 text-muted-foreground">{t(CATEGORY_LABEL[check.category])}</span>
      {check.isRequired && (
        <span
          data-testid={`pr-check-required-${check.name}`}
          className="ml-auto shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {t('pr.checks.required')}
        </span>
      )}
    </li>
  )
}
