import { useState, useEffect } from 'react'
import { CreateBranchHereDialog } from '../CreateBranchHereDialog'
import { ResetDialog } from '../../rollback/ResetDialog'
import { RevertDialog } from '../../rollback/RevertDialog'
import type { GitGraphNode } from '@git-manager/git-types'

interface GitGraphOverlayManagerProps {
  repoPath: string
  nodes: GitGraphNode[]
  primaryOid: string | null
  protectedBranches: string[]
  /** Action to trigger from the native context menu. */
  pendingAction: 'reset' | 'revert' | 'branch' | null
  onClearPendingAction: () => void
}

export function GitGraphOverlayManager({
  repoPath,
  nodes,
  primaryOid,
  protectedBranches,
  pendingAction,
  onClearPendingAction,
}: GitGraphOverlayManagerProps) {
  const [resetOid, setResetOid] = useState<string | null>(null)
  const [revertOid, setRevertOid] = useState<string | null>(null)
  const [branchOid, setBranchOid] = useState<string | null>(null)

  // React to native menu actions dispatched via pendingAction
  useEffect(() => {
    if (!pendingAction || !primaryOid) return

    if (pendingAction === 'reset') setResetOid(primaryOid)
    else if (pendingAction === 'revert') setRevertOid(primaryOid)
    else if (pendingAction === 'branch') setBranchOid(primaryOid)

    onClearPendingAction()
  }, [pendingAction, primaryOid, onClearPendingAction])

  const resetNode = resetOid ? nodes.find((n) => n.commit.oid === resetOid) ?? null : null
  const revertNode = revertOid ? nodes.find((n) => n.commit.oid === revertOid) ?? null : null
  const branchNode = branchOid ? nodes.find((n) => n.commit.oid === branchOid) ?? null : null

  return (
    <>
      {/* Dialogs triggered by the native context menu */}
      {resetNode && (
        <ResetDialog
          repoPath={repoPath}
          targetOid={resetNode.commit.oid}
          targetSubject={resetNode.commit.subject}
          open
          onClose={() => setResetOid(null)}
          onSuccess={() => setResetOid(null)}
          protectedBranches={protectedBranches}
        />
      )}
      {revertNode && (
        <RevertDialog
          repoPath={repoPath}
          commitOid={revertNode.commit.oid}
          commitSubject={revertNode.commit.subject}
          open
          onClose={() => setRevertOid(null)}
          onSuccess={() => setRevertOid(null)}
        />
      )}
      {branchNode && (
        <CreateBranchHereDialog
          repoPath={repoPath}
          oid={branchNode.commit.oid}
          shortOid={branchNode.commit.shortOid}
          open
          onClose={() => setBranchOid(null)}
        />
      )}
    </>
  )
}
