import { useTranslation } from '@git-manager/i18n'
import type { GhRawPR } from '../../../api/github.api'
import { prStateKind, prStateVisual } from './prState'

interface PrMetaProps {
  pr: GhRawPR
}

/** The line under the title: the state pill (open/draft/closed/merged) plus the author's avatar and
 * "<user> wants to merge <head> into <base>". Composed from two small keys so the branch names can be
 * styled as mono chips while staying translatable (word order holds for en/fr). */
export function PrMeta({ pr }: PrMetaProps) {
  const { t } = useTranslation('git')
  const visual = prStateVisual(prStateKind(pr))
  const login = pr.user?.login ?? '—'
  const head = pr.head?.ref ?? '—'
  const base = pr.base?.ref ?? '—'

  const chip = 'rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground'

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-2">
      <span
        data-testid="pr-state-badge"
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${visual.badgeClassName}`}
      >
        {t(visual.labelKey)}
      </span>

      {pr.user?.avatar_url && (
        <img
          src={pr.user.avatar_url}
          alt={login}
          className="h-5 w-5 rounded-full"
          data-testid="pr-author-avatar"
        />
      )}

      <span
        className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        data-testid="pr-merge-summary"
      >
        <span className="font-medium text-foreground">{login}</span>
        {t('pr.meta.wantsToMerge')}
        <span className={chip}>{head}</span>
        {t('pr.meta.into')}
        <span className={chip}>{base}</span>
      </span>
    </div>
  )
}
