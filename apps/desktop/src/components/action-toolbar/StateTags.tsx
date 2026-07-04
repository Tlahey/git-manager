import { Badge } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

/**
 * Badge dynamique indiquant l'état du dépôt : `MODIFIÉ`.
 * Detached HEAD et rebase/conflit sont déjà visibles via BranchContext et la
 * ligne CONFLICT synthétique dans le graphe, donc pas dupliqués ici.
 */
export function StateTags() {
  const { t } = useTranslation('git')
  const { activeRepo } = useRepoUIStore()
  const { repoCache } = useRepoDataStore()
  const repo = activeRepo ? repoCache[activeRepo] : undefined

  if (!repo) return null

  return (
    <div className="flex shrink-0 items-center gap-1">
      {repo.isDirty && (
        <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px] tracking-wide">
          {t('toolbar.dirty')}
        </Badge>
      )}
    </div>
  )
}
