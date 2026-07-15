import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { MessageSquarePlus } from 'lucide-react'
import type { GhUser } from '../../../api/github.api'
import { usePrDetail } from '../../../hooks/usePrDetail'
import { usePrComments } from '../../../hooks/usePrComments'
import { usePrActions } from '../../../hooks/usePrActions'
import { useAssignableUsers, useRepoLabels } from '../../../hooks/usePrEditCandidates'
import { PrFilesList } from './PrFilesList'
import { PrReviewComposer } from './PrReviewComposer'
import { PrCodeSuggestions } from './PrCodeSuggestions'
import { PrSidebarSection } from './PrSidebarSection'
import { PrUserList } from './PrUserList'
import { PrStateActions } from './PrStateActions'
import { PrEditPopover, type PrEditOption } from './PrEditPopover'

interface PrSidePanelProps {
  repoPath: string
  prNumber: number
}

type EditTarget = 'reviewers' | 'assignees' | 'labels' | null

/** Right-hand panel while a PR is open (replaces `CommitDetailsPanel`): changed files + a review
 * composer, unresolved code suggestions, then labeled sections for reviewers, assignees, labels,
 * participants and the branch (the first three editable via a shared search popover), plus the
 * lifecycle actions (draft / close / reopen). A thin composition — each block owns its data. */
export function PrSidePanel({ repoPath, prNumber }: PrSidePanelProps) {
  const { t } = useTranslation('git')
  const { pr, isLoading } = usePrDetail(repoPath, prNumber)
  const { comments } = usePrComments(repoPath, prNumber)
  const { requestReviewer, unrequestReviewer, assign, unassign, addLabel, deleteLabel, pending } =
    usePrActions(repoPath, prNumber)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [editing, setEditing] = useState<EditTarget>(null)

  const usersEnabled = editing === 'reviewers' || editing === 'assignees'
  const { users, isLoading: usersLoading } = useAssignableUsers(repoPath, usersEnabled)
  const { labels: repoLabels, isLoading: labelsLoading } = useRepoLabels(repoPath, editing === 'labels')

  const userOptions = useMemo<PrEditOption[]>(
    () => users.map((u) => ({ key: u.login, label: u.login, avatarUrl: u.avatar_url })),
    [users]
  )
  const labelOptions = useMemo<PrEditOption[]>(
    () => repoLabels.map((l) => ({ key: l.name, label: l.name, color: l.color })),
    [repoLabels]
  )

  // Participants ≈ everyone visibly involved: author + requested reviewers + assignees + commenters.
  // GitHub has no direct participants endpoint, so we derive a de-duplicated set.
  const participants = useMemo<GhUser[]>(() => {
    const byLogin = new Map<string, GhUser>()
    const add = (u?: GhUser) => {
      if (u?.login && !byLogin.has(u.login)) byLogin.set(u.login, u)
    }
    add(pr?.user)
    pr?.requested_reviewers?.forEach(add)
    pr?.assignees?.forEach(add)
    comments.forEach((c) => add(c.user))
    return [...byLogin.values()]
  }, [pr, comments])

  if (isLoading || !pr) {
    return (
      <div
        data-testid="pr-side-panel"
        className="flex h-full items-center justify-center overflow-hidden"
      >
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }

  const head = pr.head?.ref ?? '—'
  const base = pr.base?.ref ?? '—'
  const chip = 'rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground'
  const reviewerKeys = (pr.requested_reviewers ?? []).map((u) => u.login)
  const assigneeKeys = (pr.assignees ?? []).map((u) => u.login)
  const labelKeys = (pr.labels ?? []).map((l) => l.name)

  function toggle(target: Exclude<EditTarget, null>) {
    setEditing((e) => (e === target ? null : target))
  }

  return (
    <div data-testid="pr-side-panel" className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <PrFilesList
          repoPath={repoPath}
          prNumber={prNumber}
          headerAction={
            <button
              onClick={() => setReviewOpen((v) => !v)}
              data-testid="pr-review-toggle"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-accent"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {t('pr.review.submit')}
            </button>
          }
        />

        {reviewOpen && <PrReviewComposer repoPath={repoPath} prNumber={prNumber} />}

        <PrCodeSuggestions repoPath={repoPath} prNumber={prNumber} />

        <PrSidebarSection
          title={t('pr.side.reviewers')}
          testId="pr-reviewers"
          onEdit={() => toggle('reviewers')}
          editTitle={t('pr.side.editReviewers')}
        >
          <PrUserList users={pr.requested_reviewers ?? []} emptyLabel="pr.side.noReviewers" />
          {editing === 'reviewers' && (
            <PrEditPopover
              title={t('pr.side.editReviewers')}
              options={userOptions}
              selectedKeys={reviewerKeys}
              loading={usersLoading}
              busy={pending}
              onAdd={requestReviewer}
              onRemove={unrequestReviewer}
              onClose={() => setEditing(null)}
            />
          )}
        </PrSidebarSection>

        <PrSidebarSection
          title={t('pr.side.assignees')}
          testId="pr-assignees"
          onEdit={() => toggle('assignees')}
          editTitle={t('pr.side.editAssignees')}
        >
          <PrUserList users={pr.assignees ?? []} emptyLabel="pr.side.noAssignees" />
          {editing === 'assignees' && (
            <PrEditPopover
              title={t('pr.side.editAssignees')}
              options={userOptions}
              selectedKeys={assigneeKeys}
              loading={usersLoading}
              busy={pending}
              onAdd={assign}
              onRemove={unassign}
              onClose={() => setEditing(null)}
            />
          )}
        </PrSidebarSection>

        <PrSidebarSection
          title={t('pr.side.labels')}
          testId="pr-labels"
          onEdit={() => toggle('labels')}
          editTitle={t('pr.side.editLabels')}
        >
          {pr.labels && pr.labels.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {pr.labels.map((l) => (
                <li
                  key={l.name}
                  data-testid={`pr-label-${l.name}`}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
                >
                  {l.color && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: `#${l.color}` }}
                    />
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
              onAdd={addLabel}
              onRemove={deleteLabel}
              onClose={() => setEditing(null)}
            />
          )}
        </PrSidebarSection>

        <PrSidebarSection title={t('pr.side.participants')} testId="pr-participants">
          <PrUserList users={participants} emptyLabel="pr.side.noParticipants" />
        </PrSidebarSection>

        <PrSidebarSection title={t('pr.side.branch')} testId="pr-branch">
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span className={chip}>{head}</span>
            <span>{t('pr.meta.into')}</span>
            <span className={chip}>{base}</span>
          </div>
        </PrSidebarSection>

        <PrStateActions repoPath={repoPath} prNumber={prNumber} pr={pr} />
      </div>
    </div>
  )
}
