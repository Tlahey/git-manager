import { useTranslation } from '@git-manager/i18n'
import { ToggleGroup, type ToggleGroupOption } from '@git-manager/ui'
import { GitCommitHorizontal, FolderOpen, Kanban } from 'lucide-react'
import { useRepoViewStore, type RepoView } from '../../stores/repoView.store'

/**
 * Picks which of the repo tab's three views is on screen — the commit graph, the project files, or
 * the Kanban board.
 *
 * **The only view switcher there is.** It replaced a tab strip under the toolbar, which in turn
 * replaced a pair of toggle buttons here; what settled the question is that a switch changes the
 * toolbar's middle section *and* the left panel with it, so two controls for it meant two places to
 * keep in step and one of them always out of date.
 *
 * A segmented control rather than three toolbar buttons: exactly one is selected at a time, and
 * `ToggleGroup` says so — native radios sharing a name, so keyboard roving and form semantics come
 * for free, and the selected fill rides the `--button-*` tokens that 13 of the 15 themes correct for
 * contrast. Three loose buttons would have to spell "which one is on" in icon tint alone.
 *
 * Icon-only, with each label carried as a tooltip and an accessible name (see `ToggleGroup`): this
 * sits in a 52px bar next to the command palette, and three visible labels would cost the width the
 * active view's own actions need.
 */
export function RepoViewSwitcher() {
  const { t } = useTranslation('git')
  const view = useRepoViewStore((s) => s.view)
  const setView = useRepoViewStore((s) => s.setView)

  const options: ToggleGroupOption<RepoView>[] = [
    {
      value: 'graph',
      icon: <GitCommitHorizontal className="h-4 w-4" />,
      label: t('toolbar.graph'),
      testId: 'repo-view-graph',
    },
    {
      value: 'files',
      icon: <FolderOpen className="h-4 w-4" />,
      label: t('toolbar.files'),
      testId: 'repo-view-files',
    },
    {
      value: 'board',
      icon: <Kanban className="h-4 w-4" />,
      label: t('toolbar.board'),
      testId: 'repo-view-board',
    },
  ]

  return (
    <ToggleGroup
      name="repoView"
      value={view}
      onValueChange={setView}
      options={options}
      className="shrink-0"
    />
  )
}
