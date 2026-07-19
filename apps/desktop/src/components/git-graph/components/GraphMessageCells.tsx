import { FolderGit2, GitBranch, AlertTriangle, GitMerge } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { Tag } from '@git-manager/ui'

interface WipStats {
  added: number
  modified: number
  deleted: number
}

/** Ref (branch or worktree) a "// WIP" row belongs to. `isWorktree` wins over a plain branch —
 * a linked worktree gets the worktree icon even though it is also checked out on a branch. */
export interface WipRef {
  name: string
  isWorktree: boolean
}

/** Longest branch/worktree name shown inline in a "// WIP" tag before it's cropped (the full
 * name stays available on hover via `title`). */
const WIP_REF_MAX_CHARS = 31

/** Small tag identifying the branch (or worktree) a "// WIP" row is on: a worktree/branch icon
 * plus the name cropped to `WIP_REF_MAX_CHARS`, with the full name revealed on hover. */
function WipRefTag({ refInfo }: { refInfo: WipRef }) {
  if (!refInfo.name) return null
  const Icon = refInfo.isWorktree ? FolderGit2 : GitBranch
  const cropped =
    refInfo.name.length > WIP_REF_MAX_CHARS
      ? `${refInfo.name.slice(0, WIP_REF_MAX_CHARS)}…`
      : refInfo.name
  return (
    <Tag tone="neutral" className="min-w-0 px-1 py-0.5 text-[9px]" title={refInfo.name}>
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{cropped}</span>
    </Tag>
  )
}

/** Message-column content for the primary (own-repo) "// WIP" row: an editable commit message
 * input bound to the per-repo WIP draft, committable on Enter. */
export function WipCommitInput({
  wipStats,
  refInfo,
  onCommit,
}: {
  wipStats: WipStats
  /** Branch (or worktree) the active repo's WIP is on — shown as a tag. */
  refInfo?: WipRef
  onCommit?: (message: string) => void
}) {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const wipMessages = useRepoDataStore((s) => s.wipMessages)
  const setWipMessage = useRepoDataStore((s) => s.setWipMessage)

  const value = activeRepo ? wipMessages[activeRepo] || '' : ''

  function setValue(val: string) {
    if (activeRepo) {
      setWipMessage(activeRepo, val)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (value.trim()) {
        onCommit?.(value)
      }
    }
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden pr-4">
      {/* Only the input itself blocks the row's onSelect — typing/placing the cursor shouldn't
          fight with row selection. Clicking anywhere else in this cell (e.g. the badge) still
          bubbles up and selects the 'WIP' row, which is what actually shows the changed files
          (CommitDetailsPanel). Previously the whole cell stopped propagation, which silently
          swallowed that click and made "click WIP to see changed files" look broken. */}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        placeholder="// WIP"
        className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent px-2 text-[11px] text-foreground placeholder-muted-foreground/60 transition-colors focus:border-primary/60 focus:outline-none"
      />
      {refInfo && <WipRefTag refInfo={refInfo} />}
      <div className="flex shrink-0 select-none items-center gap-1 text-[9px] font-bold">
        {wipStats.added > 0 && (
          <Tag tone="success" className="px-1 py-0.5 text-[9px]">
            +{wipStats.added}
          </Tag>
        )}
        {wipStats.modified > 0 && (
          <Tag tone="warning" className="px-1 py-0.5 text-[9px]">
            ~{wipStats.modified}
          </Tag>
        )}
        {wipStats.deleted > 0 && (
          <Tag tone="danger" className="px-1 py-0.5 text-[9px]">
            -{wipStats.deleted}
          </Tag>
        )}
      </div>
    </div>
  )
}

/** Message-column content for a secondary "// WIP" row anchored to another linked worktree:
 * just a "// WIP" marker, its read-only changed-file count, and an "Open Worktree" tag revealed
 * only once the row is selected/primary (`showOpenButton`). The worktree's branch is already shown
 * by the row's own ref label, so it isn't repeated here. No commit input — committing into another
 * worktree isn't something this row does.
 *
 * Clicking the row itself just *selects* it (the click bubbles up to the graph's row-select
 * handler, which is what flips `showOpenButton` on and surfaces the tag) — it does NOT switch to
 * the worktree. Switching is a deliberate click on the "Open Worktree" tag, which stops
 * propagation so it opens the worktree without re-selecting the row.
 *
 * The worktree's branch is shown as a `WipRefTag` (worktree icon + name) since the synthetic row
 * carries no ref label of its own. */
export function WorktreeWipRow({
  wipStats,
  refInfo,
  onOpenWorktree,
  showOpenButton,
}: {
  wipStats: WipStats
  /** Worktree (branch) this WIP row is anchored to — shown as a tag with the worktree icon. */
  refInfo?: WipRef
  onOpenWorktree?: () => void
  showOpenButton?: boolean
}) {
  const { t } = useTranslation('git')
  return (
    <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden pr-4">
      <span className="shrink-0 text-[11px] text-muted-foreground/70">// WIP</span>
      {refInfo && <WipRefTag refInfo={refInfo} />}
      <div className="flex shrink-0 select-none items-center gap-1 text-[9px] font-bold">
        {wipStats.added > 0 && (
          <Tag tone="success" className="px-1 py-0.5 text-[9px]">
            +{wipStats.added}
          </Tag>
        )}
        {wipStats.modified > 0 && (
          <Tag tone="warning" className="px-1 py-0.5 text-[9px]">
            ~{wipStats.modified}
          </Tag>
        )}
        {wipStats.deleted > 0 && (
          <Tag tone="danger" className="px-1 py-0.5 text-[9px]">
            -{wipStats.deleted}
          </Tag>
        )}
      </div>
      {showOpenButton && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenWorktree?.()
          }}
          className="flex shrink-0 items-center gap-1 rounded border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-primary/30"
        >
          <FolderGit2 className="h-3 w-3" />
          {t('gitTree.wip.openWorktree')}
        </button>
      )}
    </div>
  )
}

/** Message-column content for the synthetic "CONFLICT" row (paused rebase). */
export function ConflictRowMessage({ count, branchName }: { count: number; branchName?: string }) {
  const { t } = useTranslation('git')
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pr-4">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-white" />
      <GitMerge className="h-3.5 w-3.5 shrink-0 text-white" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white">
        {t('gitTree.contextMenu.conflictBannerMessage', { count, branch: branchName ?? '' })}
      </span>
    </div>
  )
}
