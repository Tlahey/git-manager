import { useTranslation } from '@git-manager/i18n'
import type { RepoScopedSettings } from '@git-manager/git-types'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useCanonicalRepoPath } from '../../../hooks/useCanonicalRepoPath'

interface OverriddenBadgeProps {
  field: keyof RepoScopedSettings
}

/**
 * Small "(overridden)" tag shown next to a *global* setting when the active repo overrides it in its
 * Local configuration — so the user editing the global value knows the current workspace ignores it.
 * Renders nothing when there's no active repo or no override for that field.
 */
export function OverriddenBadge({ field }: OverriddenBadgeProps) {
  const { t } = useTranslation('settings')
  // Scope to the owning repo (main worktree) so a linked worktree reflects the repo's overrides.
  const activeRepo = useCanonicalRepoPath(useRepoUIStore((s) => s.activeRepo))
  const overridden = useSettingsStore((s) =>
    activeRepo ? s.settings.repoOverrides[activeRepo]?.[field] !== undefined : false
  )

  if (!overridden) return null

  return (
    <span
      data-testid={`overridden-badge-${field}`}
      title={t('settings.repository.overriddenHint')}
      className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
    >
      {t('settings.repository.overriddenTag')}
    </span>
  )
}
