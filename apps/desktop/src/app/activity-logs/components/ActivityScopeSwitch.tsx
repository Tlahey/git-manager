import { useTranslation } from '@git-manager/i18n'
import { AppWindow, GitBranch } from 'lucide-react'
import type { ActivityScope } from '../../../lib/groupActivityLog'

interface ActivityScopeSwitchProps {
  scope: ActivityScope
  onScopeChange: (scope: ActivityScope) => void
  /** Repository scope is disabled when no repository is active (nothing to scope to). */
  repositoryEnabled: boolean
}

/**
 * Segmented control choosing whether the view shows the whole application's activity or only the
 * active repository's. A plain two-button segment (there is no shared Tabs primitive to consume).
 */
export function ActivityScopeSwitch({
  scope,
  onScopeChange,
  repositoryEnabled,
}: ActivityScopeSwitchProps) {
  const { t } = useTranslation('common')

  const base =
    'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors'
  const active = 'bg-button text-button-foreground shadow-sm'
  const inactive = 'text-muted-foreground hover:bg-accent hover:text-foreground'

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5"
      data-testid="activity-scope-switch"
    >
      <button
        type="button"
        className={`${base} ${scope === 'application' ? active : inactive}`}
        onClick={() => onScopeChange('application')}
        data-testid="activity-scope-application"
        aria-pressed={scope === 'application'}
      >
        <AppWindow className="h-3.5 w-3.5" />
        {t('activityLogs.scope.application')}
      </button>
      <button
        type="button"
        className={`${base} ${scope === 'repository' ? active : inactive} disabled:cursor-not-allowed disabled:opacity-40`}
        onClick={() => onScopeChange('repository')}
        disabled={!repositoryEnabled}
        title={repositoryEnabled ? undefined : t('activityLogs.repositoryScopeDisabled')}
        data-testid="activity-scope-repository"
        aria-pressed={scope === 'repository'}
      >
        <GitBranch className="h-3.5 w-3.5" />
        {t('activityLogs.scope.repository')}
      </button>
    </div>
  )
}
