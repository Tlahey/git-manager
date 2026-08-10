import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useOpenRepoTab } from '../../../hooks/useOpenRepoTab'
import type { DashboardSectionId } from '../stores/dashboard.store'

export interface SectionAction {
  /** Stable id, also used as the `data-testid` suffix so tests don't depend on copy. */
  id: string
  label: string
  run: (paths: string[]) => void
  destructive?: boolean
}

export interface SectionActions {
  /**
   * The section's leading, destructive button — "Close repositories" / "Remove all". `null` for
   * Favorites and All repositories, which have no whole-section destructive operation.
   */
  lead: SectionAction | null
  /** Whether the Fetch / Pull / Open-in-editor toolbar applies to this section. */
  showRepoTools: boolean
  /** Entries added to the options menu on top of Hide / Select All / Unselect All / Change color. */
  extraOptions: SectionAction[]
}

/**
 * What each dashboard section's header can do.
 *
 * "All repositories" deliberately gets no tools and no leading action: it is the catch-all listing,
 * where a stray click would fetch or close dozens of repos at once.
 */
export function useSectionActions(id: DashboardSectionId): SectionActions {
  const { t } = useTranslation('dashboard')
  const forgetRecentRepo = useRepoDataStore((s) => s.forgetRecentRepo)
  const closeTab = useRepoUIStore((s) => s.closeTab)
  const openRepoTab = useOpenRepoTab()

  return useMemo(() => {
    const openAllInTabs: SectionAction = {
      id: 'open-all-new-tabs',
      label: t('dashboard.section.openAllNewTabs'),
      run: (paths) => paths.forEach(openRepoTab),
    }

    switch (id) {
      case 'open':
        return {
          lead: {
            id: 'close-repos',
            label: t('dashboard.section.closeRepos'),
            run: (paths: string[]) => paths.forEach(closeTab),
            destructive: true,
          },
          showRepoTools: true,
          extraOptions: [],
        }
      case 'favorites':
        return { lead: null, showRepoTools: true, extraOptions: [openAllInTabs] }
      case 'recent':
        return {
          lead: {
            id: 'remove-all-recent',
            label: t('dashboard.section.removeAllRecent'),
            // Targets, not the whole list: with rows checked this must forget only those. It
            // reads as "remove all" because with nothing checked the target IS every visible row.
            run: (paths: string[]) => paths.forEach(forgetRecentRepo),
            destructive: true,
          },
          showRepoTools: true,
          extraOptions: [openAllInTabs],
        }
      case 'all':
        return { lead: null, showRepoTools: false, extraOptions: [] }
    }
  }, [id, t, openRepoTab, closeTab, forgetRecentRepo])
}
