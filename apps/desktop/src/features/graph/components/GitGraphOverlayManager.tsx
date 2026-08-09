import { useState, useEffect } from 'react'
import { CreateBranchHereDialog } from './CreateBranchHereDialog'
import { RenameBranchDialog } from './RenameBranchDialog'
import { SetUpstreamDialog } from './SetUpstreamDialog'
import { ResetDialog } from '../../../components/rollback/ResetDialog'
import { RevertDialog } from '../../../components/rollback/RevertDialog'
import { CompareToWorkdirDialog } from './CompareToWorkdirDialog'
import { CompareToParentDialog } from './CompareToParentDialog'
import { RecomposeDialog } from './RecomposeDialog'
import { shortOid } from '../../../lib/shortOid'
import type { GitGraphNode } from '@git-manager/git-types'
import type { RevertParent } from '../../../components/rollback/RevertDialog'
import type { PendingAction } from '../hooks/useGitGraphActions'

interface GitGraphOverlayManagerProps {
  repoPath: string
  nodes: GitGraphNode[]
  primaryOid: string | null
  protectedBranches: string[]
  /** Action to trigger from the native context menu. */
  pendingAction: PendingAction
  onClearPendingAction: () => void
}

type ActiveDialog = (PendingAction & { oid: string }) | null

export function GitGraphOverlayManager({
  repoPath,
  nodes,
  primaryOid,
  protectedBranches,
  pendingAction,
  onClearPendingAction,
}: GitGraphOverlayManagerProps) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)

  // React to native menu actions dispatched via pendingAction
  useEffect(() => {
    if (!pendingAction || !primaryOid) return

    setActiveDialog({ ...pendingAction, oid: primaryOid })
    onClearPendingAction()
  }, [pendingAction, primaryOid, onClearPendingAction])

  const activeNode = activeDialog
    ? (nodes.find((n) => n.commit.oid === activeDialog.oid) ?? null)
    : null

  if (!activeNode) return null

  const closeDialog = () => setActiveDialog(null)

  /**
   * The commit's parents as the revert dialog wants them. Resolved against the loaded page, so a
   * parent scrolled out of it keeps its position (that is what `-m` names) and simply shows its
   * short sha with no subject — the picker must still list every parent, or the mainline the user
   * needs could be the one missing from it.
   */
  const parents: RevertParent[] = activeNode.commit.parentOids.map((parentOid) => {
    const node = nodes.find((n) => n.commit.oid === parentOid)
    return {
      oid: parentOid,
      shortOid: node?.commit.shortOid ?? shortOid(parentOid),
      subject: node?.commit.subject ?? '',
    }
  })

  switch (activeDialog?.kind) {
    case 'reset':
      return (
        <ResetDialog
          repoPath={repoPath}
          targetOid={activeDialog.targetOid ?? activeNode.commit.oid}
          targetSubject={activeDialog.targetSubject ?? activeNode.commit.subject}
          open
          onClose={closeDialog}
          onSuccess={closeDialog}
          protectedBranches={protectedBranches}
          initialMode={activeDialog.mode}
        />
      )
    case 'recompose':
      return (
        <RecomposeDialog
          repoPath={repoPath}
          nodes={nodes}
          targetOid={activeNode.commit.oid}
          includeChildren={activeDialog.includeChildren}
          open
          onClose={closeDialog}
          onSuccess={closeDialog}
        />
      )
    case 'revert':
      return (
        <RevertDialog
          repoPath={repoPath}
          commitOid={activeNode.commit.oid}
          commitSubject={activeNode.commit.subject}
          parents={parents}
          open
          onClose={closeDialog}
          onSuccess={closeDialog}
        />
      )
    case 'branch':
      return (
        <CreateBranchHereDialog
          repoPath={repoPath}
          oid={activeNode.commit.oid}
          shortOid={activeNode.commit.shortOid}
          open
          onClose={closeDialog}
        />
      )
    case 'renameBranch':
      return (
        // Keyed on the branch so reopening for another branch resets the prefilled input.
        <RenameBranchDialog
          key={activeDialog.branch}
          repoPath={repoPath}
          branch={activeDialog.branch}
          open
          onClose={closeDialog}
        />
      )
    case 'setUpstream':
      return (
        // Keyed on the branch, same reasoning as the rename dialog above.
        <SetUpstreamDialog
          key={activeDialog.branch}
          repoPath={repoPath}
          branch={activeDialog.branch}
          open
          onClose={closeDialog}
        />
      )
    case 'compare':
      return (
        <CompareToWorkdirDialog
          repoPath={repoPath}
          oid={activeNode.commit.oid}
          shortOid={activeNode.commit.shortOid}
          open
          onClose={closeDialog}
        />
      )
    case 'compareParent':
      return (
        // Keyed on the parent so picking the other one refetches instead of showing the first diff.
        <CompareToParentDialog
          key={activeDialog.parentNumber}
          repoPath={repoPath}
          oid={activeNode.commit.oid}
          shortOid={activeNode.commit.shortOid}
          parentNumber={activeDialog.parentNumber}
          parentShortOid={parents[activeDialog.parentNumber - 1]?.shortOid}
          open
          onClose={closeDialog}
        />
      )
    default:
      return null
  }
}
