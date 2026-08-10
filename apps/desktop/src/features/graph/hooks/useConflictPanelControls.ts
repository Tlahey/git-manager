import type { GitGraphNode, RebaseProgressStep } from '@git-manager/git-types'

interface UseConflictPanelControlsParams {
  repoPath: string
  /** The row the graph considers primary — the panel hangs off the CONFLICT one. */
  primaryNode: GitGraphNode | null
  /** The loaded page, read only to tell whether a rebase step's commit is on screen. */
  nodes: GitGraphNode[]
  /** Whether the user dismissed the files panel (see `rebaseView.store`). */
  rebaseFilesHidden: boolean
  showRebaseFiles: (repoPath: string) => void
  hideRebaseFiles: (repoPath: string) => void
  toggleRebaseFiles: (repoPath: string) => void
  selectSingle: (oid: string) => void
  setConflictFilePath: (path: string | null) => void
}

/**
 * When the conflicted-files panel is on screen, and the three ways of putting it there or taking
 * it away.
 *
 * The dismissal is explicit state rather than "the row got deselected", so the header's toggle and
 * the graph banner can put the panel back. That has one consequence worth stating, because it is
 * not obvious and it produced a bug: dismissing the panel leaves the CONFLICT row *selected*, which
 * would otherwise fall through to `CommitDetailsPanel` and render a bogus "commit" for a row that
 * has none — so `isDismissedConflictRow` keeps the whole right-hand panel closed for that row until
 * it is re-shown or another row is selected.
 */
export function useConflictPanelControls({
  repoPath,
  primaryNode,
  nodes,
  rebaseFilesHidden,
  showRebaseFiles,
  hideRebaseFiles,
  toggleRebaseFiles,
  selectSingle,
  setConflictFilePath,
}: UseConflictPanelControlsParams) {
  const isConflictRow = primaryNode?.commit.oid === 'CONFLICT'
  const isOpen = isConflictRow && !rebaseFilesHidden
  const isDismissedRow = isConflictRow && rebaseFilesHidden

  function close() {
    hideRebaseFiles(repoPath)
    setConflictFilePath(null)
  }

  /** Header toggle for the files panel: showing it again also has to re-select the row it hangs
   * off, since the user may have navigated to another commit in the meantime. */
  function toggle() {
    if (rebaseFilesHidden || !isConflictRow) {
      showRebaseFiles(repoPath)
      selectSingle('CONFLICT')
    } else {
      toggleRebaseFiles(repoPath)
    }
  }

  /** A step's commit is only openable while it's in the loaded window of the graph — the details
   * panel is built from a graph node, so selecting anything else would render nothing. */
  function isStepLoaded(step: RebaseProgressStep) {
    return !!step.oid && nodes.some((n) => n.commit.oid === step.oid)
  }

  /**
   * Clicking a row of the rebase progress rail. The step git stopped on is the one with work to
   * do, so it opens the conflicted-files panel rather than the commit's details — that panel is
   * what actually lets the user resolve the files and continue. Every other step just points at a
   * commit to inspect, which only makes sense once the graph has it loaded.
   */
  function selectStep(step: RebaseProgressStep) {
    if (step.status === 'current') {
      showRebaseFiles(repoPath)
      selectSingle('CONFLICT')
      return
    }
    if (step.oid && isStepLoaded(step)) selectSingle(step.oid)
  }

  return { isOpen, isDismissedRow, close, toggle, selectStep, isStepLoaded }
}
