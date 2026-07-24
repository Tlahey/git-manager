import { useMemo, useState } from 'react'
import { CircleDot, CircleCheck, GitBranch, GitBranchPlus, Loader2, Pencil } from 'lucide-react'
import {
  Spinner,
  toast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useIssueDetail } from '../../../hooks/useIssueDetail'
import { useRepoGitHub } from '../../../hooks/useRepoGitHub'
import { useIssueActions } from '../../../hooks/useIssueActions'
import { useAssignableUsers, useRepoLabels } from '../../../hooks/usePrEditCandidates'
import {
  addAssignees,
  removeAssignees,
  addLabels,
  removeLabel,
  setIssueState,
} from '../../../api/github.api'
import { PrSidebarSection } from '../pr/PrSidebarSection'
import { PrUserList } from '../pr/PrUserList'
import { PrEditPopover, type PrEditOption } from '../pr/PrEditPopover'
import type { MockIssue } from '../../../app/pull-requests/types'

interface IssueMetaSidebarProps {
  repoPath: string
  issueNumber: number
  /** The Launchpad issue, used to resolve the local repo for the branch section. */
  issue: MockIssue
  onChanged?: () => void
}

type EditTarget = 'assignees' | 'labels' | null

/**
 * Metadata column of the in-app issue view (Status / Assignees / Labels / Branch) — the issue-side
 * twin of {@link PrMetaSidebar}, reusing the same section/user-list/edit-popover pieces. Status is a
 * toggle (close ↔ reopen); assignees and labels edit through the shared search popover (issue REST
 * endpoints); the branch section offers "Create a branch for this issue" against the local repo.
 */
export function IssueMetaSidebar({ repoPath, issueNumber, issue, onChanged }: IssueMetaSidebarProps) {
  const { t } = useTranslation('git')
  const { issue: detail, isLoading, refresh } = useIssueDetail(repoPath, issueNumber)
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { repoPath: localRepoPath, branch, createBranch, creatingBranch } = useIssueActions(
    issue,
    onChanged
  )

  const [editing, setEditing] = useState<EditTarget>(null)
  const [pending, setPending] = useState(false)

  const { users, isLoading: usersLoading } = useAssignableUsers(repoPath, editing === 'assignees')
  const { labels: repoLabels, isLoading: labelsLoading } = useRepoLabels(repoPath, editing === 'labels')

  const userOptions = useMemo<PrEditOption[]>(
    () => users.map((u) => ({ key: u.login, label: u.login, avatarUrl: u.avatar_url })),
    [users]
  )
  const labelOptions = useMemo<PrEditOption[]>(
    () => repoLabels.map((l) => ({ key: l.name, label: l.name, color: l.color })),
    [repoLabels]
  )

  async function run(op: () => Promise<unknown>) {
    if (!ownerRepo || !token) return
    setPending(true)
    try {
      await op()
      refresh()
      onChanged?.()
    } catch (e) {
      toast.error(t('issue.view.stateFailed'), { description: String(e) })
    } finally {
      setPending(false)
    }
  }

  if (isLoading || !detail) {
    return (
      <div data-testid="issue-meta-sidebar" className="flex h-full items-center justify-center">
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }

  const isOpen = detail.state === 'open'
  const assigneeKeys = (detail.assignees ?? []).map((u) => u.login)
  const labelKeys = (detail.labels ?? []).map((l) => l.name)

  function toggle(target: Exclude<EditTarget, null>) {
    setEditing((e) => (e === target ? null : target))
  }

  return (
    <div data-testid="issue-meta-sidebar">
      {/* Status — pick Open/Closed from a dropdown opened by the edit icon. */}
      <PrSidebarSection title={t('issue.side.status')} testId="issue-status">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isOpen
                ? 'border-success/30 bg-success/15 text-tone-success'
                : 'border-destructive/30 bg-destructive/15 text-tone-danger'
            }`}
          >
            {isOpen ? <CircleDot className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}
            {isOpen ? t('issue.view.stateOpen') : t('issue.view.stateClosed')}
          </span>
          {ownerRepo && token && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={pending}
                  data-testid="issue-status-edit"
                  title={t('issue.side.editStatus')}
                  aria-label={t('issue.side.editStatus')}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Pencil className="h-3 w-3" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem
                  data-testid="issue-status-open"
                  className="gap-2 text-xs"
                  onSelect={() =>
                    run(() => setIssueState(ownerRepo.owner, ownerRepo.repo, issueNumber, 'open', token))
                  }
                >
                  <CircleDot className="h-3.5 w-3.5 text-tone-success" />
                  {t('issue.view.stateOpen')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="issue-status-closed"
                  className="gap-2 text-xs"
                  onSelect={() =>
                    run(() =>
                      setIssueState(ownerRepo.owner, ownerRepo.repo, issueNumber, 'closed', token)
                    )
                  }
                >
                  <CircleCheck className="h-3.5 w-3.5 text-tone-danger" />
                  {t('issue.view.stateClosed')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </PrSidebarSection>

      {/* Assignees */}
      <PrSidebarSection
        title={t('pr.side.assignees')}
        testId="issue-assignees"
        onEdit={ownerRepo && token ? () => toggle('assignees') : undefined}
        editTitle={t('pr.side.editAssignees')}
      >
        <PrUserList users={detail.assignees ?? []} emptyLabel="pr.side.noAssignees" />
        {editing === 'assignees' && (
          <PrEditPopover
            title={t('pr.side.editAssignees')}
            options={userOptions}
            selectedKeys={assigneeKeys}
            loading={usersLoading}
            busy={pending}
            onAdd={(login) =>
              run(() => addAssignees(ownerRepo!.owner, ownerRepo!.repo, issueNumber, [login], token!))
            }
            onRemove={(login) =>
              run(() => removeAssignees(ownerRepo!.owner, ownerRepo!.repo, issueNumber, [login], token!))
            }
            onClose={() => setEditing(null)}
          />
        )}
      </PrSidebarSection>

      {/* Labels */}
      <PrSidebarSection
        title={t('pr.side.labels')}
        testId="issue-labels"
        onEdit={ownerRepo && token ? () => toggle('labels') : undefined}
        editTitle={t('pr.side.editLabels')}
      >
        {detail.labels && detail.labels.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {detail.labels.map((l) => (
              <li
                key={l.name}
                data-testid={`issue-label-${l.name}`}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
              >
                {l.color && (
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `#${l.color}` }} />
                )}
                {l.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t('pr.side.noLabels')}</p>
        )}
        {editing === 'labels' && (
          <PrEditPopover
            title={t('pr.side.editLabels')}
            options={labelOptions}
            selectedKeys={labelKeys}
            loading={labelsLoading}
            busy={pending}
            onAdd={(name) =>
              run(() => addLabels(ownerRepo!.owner, ownerRepo!.repo, issueNumber, [name], token!))
            }
            onRemove={(name) =>
              run(() => removeLabel(ownerRepo!.owner, ownerRepo!.repo, issueNumber, name, token!))
            }
            onClose={() => setEditing(null)}
          />
        )}
      </PrSidebarSection>

      {/* Branch — link to a local branch, or offer to create one for this issue. */}
      <PrSidebarSection title={t('pr.side.branch')} testId="issue-branch">
        {branch ? (
          <span className="flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            {branch}
          </span>
        ) : localRepoPath ? (
          <button
            onClick={createBranch}
            disabled={creatingBranch}
            data-testid="issue-create-branch"
            className="flex w-full items-center justify-start gap-1.5 rounded border border-border px-2 py-1.5 text-left text-[11px] text-primary transition-colors hover:bg-accent disabled:opacity-50"
          >
            {creatingBranch ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <GitBranchPlus className="h-3 w-3 shrink-0" />
            )}
            {t('issue.side.createBranch')}
          </button>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t('issue.side.noLocalRepo')}</p>
        )}
      </PrSidebarSection>
    </div>
  )
}
