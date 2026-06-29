import React, { useState } from 'react'
import { CommitContextMenu } from '../CommitContextMenu'
import { CreateBranchHereDialog } from '../CreateBranchHereDialog'
import { ResetDialog } from '../../rollback/ResetDialog'
import { RevertDialog } from '../../rollback/RevertDialog'
import type { GitGraphNode } from '@git-manager/git-types'

interface GitGraphOverlayManagerProps {
  repoPath: string
  nodes: GitGraphNode[]
  primaryOid: string | null
  protectedBranches: string[]
  menuIsOpen: boolean
  menuPosition: { x: number; y: number } | null
  menuRef: React.RefObject<HTMLDivElement>
  menuTargets: string[]
  menuClose: () => void
  onCopySha: () => Promise<void>
  onFixup: () => Promise<void>
}

export function GitGraphOverlayManager({
  repoPath,
  nodes,
  primaryOid,
  protectedBranches,
  menuIsOpen,
  menuPosition,
  menuRef,
  menuTargets,
  menuClose,
  onCopySha,
  onFixup,
}: GitGraphOverlayManagerProps) {
  const [resetOid, setResetOid] = useState<string | null>(null)
  const [revertOid, setRevertOid] = useState<string | null>(null)
  const [branchOid, setBranchOid] = useState<string | null>(null)

  const resetNode = resetOid ? nodes.find((n) => n.commit.oid === resetOid) ?? null : null
  const revertNode = revertOid ? nodes.find((n) => n.commit.oid === revertOid) ?? null : null
  const branchNode = branchOid ? nodes.find((n) => n.commit.oid === branchOid) ?? null : null

  return (
    <>
      {/* Context Menu */}
      {menuIsOpen && menuPosition && (
        <CommitContextMenu
          position={menuPosition}
          menuRef={menuRef}
          targetCount={menuTargets.length}
          onClose={menuClose}
          onReset={() => setResetOid(primaryOid)}
          onRevert={() => setRevertOid(primaryOid)}
          onCreateBranch={() => setBranchOid(primaryOid)}
          onCopySha={onCopySha}
          onFixup={onFixup}
        />
      )}

      {/* Dialogs */}
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
