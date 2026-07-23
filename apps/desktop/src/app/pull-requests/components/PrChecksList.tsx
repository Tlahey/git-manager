import { CheckCircle2, XCircle, Loader2, Circle, ExternalLink } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { CiDetail } from '../types'
import { openUrl } from '../utils'

const ICONS: Record<CiDetail['status'], typeof Circle> = {
  success: CheckCircle2,
  failure: XCircle,
  running: Loader2,
  skipped: Circle,
  unknown: Circle,
}

const TONES: Record<CiDetail['status'], string> = {
  success: 'text-tone-success',
  failure: 'text-tone-danger',
  running: 'text-tone-warning',
  skipped: 'text-muted-foreground/50',
  unknown: 'text-muted-foreground/50',
}

/**
 * The PR's individual CI checks as a full list — each row links to its run on GitHub (the "link to
 * the action" the Launchpad was missing). Unlike the compact row badge's hover tooltip, this is a
 * persistent, clickable list. Rows without a run URL are shown but not interactive.
 */
export function PrChecksList({ details }: { details: CiDetail[] }) {
  const { t } = useTranslation('launchpad')

  if (details.length === 0) {
    return <p className="text-xs text-muted-foreground/60">{t('prView.noChecks')}</p>
  }

  return (
    <ul className="flex flex-col gap-1" data-testid="pr-checks-list">
      {details.map((d, idx) => {
        const Icon = ICONS[d.status]
        const tone = TONES[d.status]
        const content = (
          <>
            <Icon
              className={`h-3.5 w-3.5 shrink-0 ${tone} ${d.status === 'running' ? 'animate-spin' : ''}`}
            />
            <span className="min-w-0 flex-1 truncate text-foreground/90">{d.name}</span>
            <span className={`shrink-0 text-[10px] font-semibold uppercase ${tone}`}>
              {d.status}
            </span>
            {d.url && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
          </>
        )
        return (
          <li key={idx}>
            {d.url ? (
              <button
                type="button"
                onClick={() => openUrl(d.url as string)}
                title={t('prView.openCheck')}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent/50"
              >
                {content}
              </button>
            ) : (
              <div className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs">
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
