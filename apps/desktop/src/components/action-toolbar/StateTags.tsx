import { useQuery } from '@tanstack/react-query'
import { Badge } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { getRebaseState } from '../../lib/tauri'

/**
 * Badges dynamiques indiquant l'état du dépôt :
 * `REBASING`, `DETACHED HEAD`, `MODIFIÉ`...
 */
export function StateTags() {
  const { t } = useTranslation('git')
  const { activeRepo } = useRepoUIStore()
  const { repoCache } = useRepoDataStore()
  const repo = activeRepo ? repoCache[activeRepo] : undefined

  const { data: rebaseState } = useQuery({
    queryKey: ['rebase-state', activeRepo],
    queryFn: () => getRebaseState(activeRepo!),
    enabled: !!activeRepo,
    refetchInterval: 4000,
  })

  if (!repo) return null

  const isRebasing = rebaseState && rebaseState.kind !== 'idle'

  return (
    <div className="flex shrink-0 items-center gap-1">
      {repo.isDetached && (
        <Badge variant="warning" className="rounded px-1.5 py-0 text-[10px] tracking-wide">
          {t('toolbar.detached')}
        </Badge>
      )}
      {isRebasing && (
        <Badge variant="destructive" className="rounded px-1.5 py-0 text-[10px] tracking-wide">
          {t('toolbar.rebasing')}
          {rebaseState?.currentStep != null && rebaseState?.totalSteps != null
            ? ` ${rebaseState.currentStep}/${rebaseState.totalSteps}`
            : ''}
        </Badge>
      )}
      {repo.isDirty && (
        <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px] tracking-wide">
          {t('toolbar.dirty')}
        </Badge>
      )}
    </div>
  )
}
