import { useCallback, useMemo, type ReactNode } from 'react'
import { Card } from '@git-manager/ui'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useDashboardStore, type DashboardSectionId } from '../../../stores/dashboard.store'
import { apiFetchRemote, apiPullBranch } from '../../../api/git.api'
import { apiOpenInEditor } from '../../../api/repo.api'
import type { PullStrategy } from '../../../lib/tauri'
import { useRepoSelection } from '../hooks/useRepoSelection'
import { useSectionActions } from '../hooks/useSectionActions'
import { useBulkRepoAction } from '../hooks/useBulkRepoAction'
import { RepoSectionHeader } from './RepoSectionHeader'
import { RepoRow } from './RepoRow'

export interface SectionRepo {
  path: string
  name: string
}

interface RepoSectionProps {
  id: DashboardSectionId
  icon: ReactNode
  title: string
  repos: SectionRepo[]
  emptyLabel: string
  onToggleReadme: (path: string) => void
  selectedReadmePath: string | null
  onToggleSummary: (path: string) => void
  selectedSummaryPath: string | null
  summaryEnabled: boolean
}

/**
 * One foldable dashboard section (Open / Favorites / Recent / All) with its own checkbox selection
 * and bulk-action bar. Fold state is persisted per section; selection deliberately is not, so a
 * restart never leaves stale rows armed for a destructive bulk action.
 */
export function RepoSection({
  id,
  icon,
  title,
  repos,
  emptyLabel,
  onToggleReadme,
  selectedReadmePath,
  onToggleSummary,
  selectedSummaryPath,
  summaryEnabled,
}: RepoSectionProps) {
  const savedRepos = useRepoDataStore((s) => s.savedRepos)
  const isCollapsed = useDashboardStore((s) => Boolean(s.collapsedSections[id]))
  const isHidden = useDashboardStore((s) => Boolean(s.hiddenSections[id]))
  const toggleSection = useDashboardStore((s) => s.toggleSection)
  const editorCommand = useSettingsStore((s) => s.settings.git.externalEditorCommand)

  const paths = useMemo(() => repos.map((r) => r.path), [repos])
  const selection = useRepoSelection(paths)
  const actions = useSectionActions(id)
  const bulk = useBulkRepoAction()

  const handleFetch = useCallback(
    (targets: string[]) => {
      void bulk.run(targets, (path) => apiFetchRemote(path))
    },
    [bulk]
  )

  const handlePull = useCallback(
    (targets: string[], strategy: PullStrategy) => {
      void bulk.run(targets, (path) => apiPullBranch(path, undefined, strategy))
    },
    [bulk]
  )

  const handleOpenInEditor = useCallback(
    (targets: string[]) => {
      if (!editorCommand) return
      void bulk.run(targets, (path) => apiOpenInEditor(path, editorCommand))
    },
    [bulk, editorCommand]
  )

  const savedByPath = useMemo(() => new Map(savedRepos.map((r) => [r.path, r])), [savedRepos])

  // A hidden section disappears entirely; it comes back from the header's hidden-sections menu.
  if (isHidden) return null

  return (
    <section data-testid={`dashboard-section-${id}`} className="space-y-2">
      <RepoSectionHeader
        sectionId={id}
        icon={icon}
        title={title}
        count={repos.length}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => toggleSection(id)}
        selection={selection}
        allPaths={paths}
        lead={actions.lead}
        showRepoTools={actions.showRepoTools}
        extraOptions={actions.extraOptions}
        onFetch={handleFetch}
        onPull={handlePull}
        onOpenInEditor={handleOpenInEditor}
        bulkState={bulk.state}
      />

      {!isCollapsed &&
        (repos.length === 0 ? (
          <p className="py-1 pl-8 text-[11px] text-muted-foreground/60 italic">{emptyLabel}</p>
        ) : (
          <Card className="relative divide-y divide-border/20 bg-card/30 shadow-xs">
            {repos.map((repo) => {
              const saved = savedByPath.get(repo.path)
              return (
                <RepoRow
                  key={repo.path}
                  path={repo.path}
                  name={repo.name}
                  isSaved={saved !== undefined}
                  isPinned={saved?.pinned ?? false}
                  isSelected={selection.isSelected(repo.path)}
                  onToggleSelected={() => selection.toggle(repo.path)}
                  onToggleReadme={() => onToggleReadme(repo.path)}
                  isReadmeActive={selectedReadmePath === repo.path}
                  onToggleSummary={() => onToggleSummary(repo.path)}
                  isSummaryActive={selectedSummaryPath === repo.path}
                  summaryEnabled={summaryEnabled}
                />
              )
            })}
          </Card>
        ))}
    </section>
  )
}
