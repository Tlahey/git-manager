import { useBisectUIStore } from './bisectUI.store'
import { usePackageHealthStore } from './packageHealth.store'
import { usePatchWorkspaceStore } from './patchWorkspace.store'
import { useStashDialogStore } from './stashDialog.store'

/**
 * Closes every panel and dialog that belongs to *one repo's* view.
 *
 * `repoUI.store` resets the view state it owns on every tab change, but the
 * workspaces that take over the graph's centre and right slots keep their own
 * stores — and those are global, not per-repo. Left alone they survive the
 * switch, so the new tab opens showing the previous repo's tool: the health
 * check reporting on manifests that are no longer the ones on screen, a patch
 * workspace pointing at files from another checkout, a half-finished bisect
 * selection waiting for commits that are not in this graph.
 *
 * Called from every path in `repoUI.store` that moves the active tab, rather
 * than from the tab bar, so a programmatic switch resets as thoroughly as a
 * click. Lives in its own module so `repoUI.store` does not have to depend on
 * four panel stores directly — and because the list is the thing that will need
 * updating when the next workspace is added.
 */
export function closeRepoScopedPanels() {
  usePatchWorkspaceStore.getState().close()
  usePackageHealthStore.getState().close()
  // Not a slot owner, but it is a modal opened against one repo path, and a
  // dialog outliving its repo is the worst of the three: it stays on screen and
  // its confirm button would act on the tab the user just left.
  useStashDialogStore.getState().closeDialog()
  useBisectUIStore.getState().cancelSetup()
}
