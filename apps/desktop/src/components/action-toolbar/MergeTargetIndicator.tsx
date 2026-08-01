import { useState } from 'react'
import { ArrowRight, CheckCircle2, Goal, Settings, TriangleAlert } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent, Separator, Tag, Tooltip } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useMergeTargetStatus } from '../../hooks/useMergeTargetStatus'

interface MergeTargetIndicatorProps {
  /** Repo or workspace path whose HEAD is compared to the merge target. */
  repoPath: string | null
  /** Opens the repo's GitFlow settings page, where the target branches are configured. Omitted
   * (e.g. in isolation) hides the settings shortcut rather than rendering a dead button. */
  onOpenSettings?: () => void
}

/**
 * Toolbar indicator for the branch's **merge target** — the branch the current work is meant to
 * land on (`origin/main` by default, per-repo configurable). Sits between the branch selector and
 * the pull-request tag, and is deliberately quiet: a muted glyph while the merge is clean, amber as
 * soon as merging into the target would conflict, and nothing at all while the target branch is the
 * one checked out (there is nothing to merge) or when no target branch exists in the repo.
 *
 * This is the *local, PR-less* counterpart of the PR panel's `mergeStateStatus` box
 * (`git-graph/pr/PrChecksBox.tsx`), which only knows about conflicts once GitHub has computed them
 * for an open pull request. Here the merge is simulated locally, so the warning shows up while the
 * branch is still unpublished.
 */
export function MergeTargetIndicator({ repoPath, onOpenSettings }: MergeTargetIndicatorProps) {
  const { t } = useTranslation('git')
  const [open, setOpen] = useState(false)
  const { data } = useMergeTargetStatus(repoPath)

  if (!data?.target || data.onTarget) return null

  const conflicting = data.hasConflicts
  const target = data.target
  const branch = data.currentBranch ?? t('mergeTarget.detachedHead')
  const summary = conflicting
    ? t('mergeTarget.conflict.summary', { branch, target })
    : t('mergeTarget.clean.summary', { branch, target })

  // Hover headline. Each phrase is the leading half of a sentence ending on the target branch,
  // which is rendered as a Tag rather than inlined into the string — so the branch name reads as
  // the same chip it does in the popover, in both locales.
  const conflictCount = data.conflictedFiles.length
  const hoverLead = !conflicting
    ? t('mergeTarget.tooltip.clean')
    : conflictCount > 0
      ? t('mergeTarget.tooltip.conflictFiles', { count: conflictCount })
      : t('mergeTarget.tooltip.conflict')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The tooltip stands down while the popover is open — the popover restates it in full, and
          two overlapping bubbles on one 24px target read as a glitch. */}
      <Tooltip
        placement="bottom"
        disabled={open}
        content={
          // Laid out inline (not as a flex row) so the space between the phrase and the branch
          // chip is a real text node: assistive tech reads "…against origin/main" as one sentence
          // rather than running the two together.
          <span data-testid="merge-target-tooltip">
            {hoverLead}{' '}
            <Tag tone={conflicting ? 'warning' : 'neutral'} className="align-middle">
              {target}
            </Tag>
          </span>
        }
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={summary}
            data-testid="merge-target-indicator"
            data-state-tone={conflicting ? 'conflict' : 'clean'}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-accent"
          >
            <Goal
              className={`h-4 w-4 ${conflicting ? 'text-amber-500' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent align="start" className="w-80 p-0" data-testid="merge-target-popover">
        <div className="space-y-2.5 p-3">
          <div className="flex items-center gap-2">
            {conflicting ? (
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
            )}
            <h3 className="text-xs font-semibold text-foreground">
              {conflicting ? t('mergeTarget.conflict.title') : t('mergeTarget.clean.title')}
            </h3>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">{summary}</p>

          <div className="flex items-center gap-1.5">
            <Tag tone="info" data-testid="merge-target-branch">
              {branch}
            </Tag>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Tag tone={conflicting ? 'warning' : 'neutral'} data-testid="merge-target-target">
              {target}
            </Tag>
          </div>

          <p className="text-[10px] text-muted-foreground/80" data-testid="merge-target-divergence">
            {t('mergeTarget.divergence', { ahead: data.ahead, behind: data.behind })}
          </p>

          {conflicting && data.conflictedFiles.length > 0 && (
            <div className="space-y-1" data-testid="merge-target-conflicted-files">
              <p className="text-[10px] font-medium text-foreground">
                {t('mergeTarget.conflict.filesTitle', { count: data.conflictedFiles.length })}
              </p>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                {data.conflictedFiles.map((file) => (
                  <li key={file} className="truncate font-mono text-[10px] text-muted-foreground">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {onOpenSettings && (
          <>
            <Separator />
            <button
              type="button"
              data-testid="merge-target-settings-link"
              onClick={() => {
                setOpen(false)
                onOpenSettings()
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('mergeTarget.openSettings')}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
