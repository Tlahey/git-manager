import { useTranslation } from '@git-manager/i18n'
import { ToggleGroup, type ToggleGroupOption } from '@git-manager/ui'
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
 * Labels, no icons — the same shape the Settings row-height picker wears, and the reason is that a
 * shape is a promise. Icon-over-label is what a `ToolbarButton` looks like, and a toolbar button
 * *does* something when pressed; these three choose between mutually exclusive states. Dressing the
 * switcher as its neighbours made it read as three commands sitting next to ⌘K, which is the
 * confusion this whole toolbar split exists to remove.
 */
export function RepoViewSwitcher() {
  const { t } = useTranslation('git')
  const view = useRepoViewStore((s) => s.view)
  const setView = useRepoViewStore((s) => s.setView)

  const options: ToggleGroupOption<RepoView>[] = [
    { value: 'graph', label: t('toolbar.graph'), testId: 'repo-view-graph' },
    { value: 'files', label: t('toolbar.files'), testId: 'repo-view-files' },
    { value: 'board', label: t('toolbar.board'), testId: 'repo-view-board' },
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
