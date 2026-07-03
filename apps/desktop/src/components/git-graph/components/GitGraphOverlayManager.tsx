import { useState, useEffect } from 'react'
import { CreateBranchHereDialog } from '../CreateBranchHereDialog'
import { ResetDialog } from '../../rollback/ResetDialog'
import { RevertDialog } from '../../rollback/RevertDialog'
import { TagDialog } from '../TagDialog'
import { CompareToWorkdirDialog } from '../CompareToWorkdirDialog'
import type { GitGraphNode } from '@git-manager/git-types'
import type { PendingAction } from '../../../hooks/useGitGraphActions'

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
    ? nodes.find((n) => n.commit.oid === activeDialog.oid) ?? null
    : null

  if (!activeNode) return null

  const closeDialog = () => setActiveDialog(null)

  switch (activeDialog?.kind) {
    case 'reset':
      return (
        <ResetDialog
          repoPath={repoPath}
          targetOid={activeNode.commit.oid}
          targetSubject={activeNode.commit.subject}
          open
          onClose={closeDialog}
          onSuccess={closeDialog}
          protectedBranches={protectedBranches}
          initialMode={activeDialog.mode}
        />
      )
    case 'revert':
      return (
        <RevertDialog
          repoPath={repoPath}
          commitOid={activeNode.commit.oid}
          commitSubject={activeNode.commit.subject}
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
    case 'tag':
      return (
        <TagDialog
          repoPath={repoPath}
          oid={activeNode.commit.oid}
          shortOid={activeNode.commit.shortOid}
          annotated={activeDialog.annotated}
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
    default:
      return null
  }
}
