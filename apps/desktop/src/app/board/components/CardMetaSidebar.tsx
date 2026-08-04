import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, NativeSelect } from '@git-manager/ui'
import { AlertTriangle, CalendarClock, X } from 'lucide-react'
import type { BoardCard, BoardCardPatch, BoardCardPriority, BoardTag } from '@git-manager/git-types'
import { PrSidebarSection } from '../../../components/git-graph/pr/PrSidebarSection'
import { useAssignableUsers } from '../../../hooks/usePrEditCandidates'
import { isOverdue, resolveCardTags } from '../cardMeta'
import { CardAssigneeField } from './CardAssigneeField'
import { CardPriorityIcon } from './CardPriorityIcon'
import { CardTagPicker } from './CardTagPicker'
import { CardBlockedSection } from './CardBlockedSection'
import { BoardCardBranchSection } from './BoardCardBranchSection'
import { CardTrackingSection } from './CardTrackingSection'

interface CardMetaSidebarProps {
  card: BoardCard
  tags: BoardTag[]
  repoPath: string
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
  /** Adds a tag to the board's palette from here — see `CardTagPicker`. */
  onCreateTag?: (name: string) => Promise<BoardTag | null>
  onCreateBranch?: () => Promise<unknown>
  onCheckoutBranch?: () => Promise<unknown>
  onUnlinkBranch?: () => Promise<unknown>
  /** Severs the link to a tracked GitHub issue — see `CardTrackingSection`. */
  onUntrack?: () => Promise<unknown>
  readOnly?: boolean
}

type EditTarget = 'assignee' | 'priority' | 'dueDate' | 'tags' | null

const PRIORITIES: BoardCardPriority[] = ['high', 'normal', 'low']

/**
 * The card's metadata column, built from the same `PrSidebarSection` blocks as the PR and issue
 * panels so the three read alike.
 *
 * Every block saves on its own — there is no draft here and no Save button. That is the point of the
 * layout: a card is a living record you adjust one field at a time, not a form you fill and submit.
 */
export function CardMetaSidebar({
  card,
  tags,
  repoPath,
  onPatch,
  onCreateTag,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
  onUntrack,
  readOnly,
}: CardMetaSidebarProps) {
  const { t } = useTranslation('board')
  const [editing, setEditing] = useState<EditTarget>(null)
  // Only fetched once the assignee block is actually opened — see `useAssignableUsers`'s `enabled`.
  const { users } = useAssignableUsers(repoPath, true)

  const cardTags = resolveCardTags({ tags }, card)
  const overdue = isOverdue(card.dueDate)
  // The stored value is just a string; it renders as a GitHub user only when one goes by that name.
  const githubUser = users.find((u) => u.login === card.assignee)

  function toggle(target: Exclude<EditTarget, null>) {
    setEditing((current) => (current === target ? null : target))
  }

  const openEditor = (target: Exclude<EditTarget, null>) =>
    readOnly ? undefined : () => toggle(target)

  return (
    <div data-testid="card-meta-sidebar">
      {/* First, above the fields it governs: on a tracked card those fields belong to the issue. */}
      {card.sourceIssue && onUntrack && (
        <PrSidebarSection title={t('card.tracking.label')} testId="card-meta-tracking">
          <CardTrackingSection card={card} onUntrack={onUntrack} readOnly={readOnly} />
        </PrSidebarSection>
      )}

      <PrSidebarSection
        title={t('card.meta.assignee')}
        testId="card-meta-assignee"
        onEdit={openEditor('assignee')}
        editTitle={t('card.meta.editAssignee')}
      >
        {card.assignee ? (
          <span className="flex items-center gap-1.5 text-[11px] text-foreground">
            {githubUser ? (
              <img src={githubUser.avatar_url} alt="" className="h-4 w-4 shrink-0 rounded-full" />
            ) : (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold uppercase text-muted-foreground">
                {card.assignee.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 truncate">{card.assignee}</span>
          </span>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t('card.meta.noAssignee')}</p>
        )}
        {editing === 'assignee' && (
          <CardAssigneeField
            assignee={card.assignee}
            repoPath={repoPath}
            onChange={(next) => onPatch({ assignee: next })}
            onClose={() => setEditing(null)}
          />
        )}
      </PrSidebarSection>

      <PrSidebarSection
        title={t('card.meta.priority')}
        testId="card-meta-priority"
        onEdit={openEditor('priority')}
        editTitle={t('card.meta.editPriority')}
      >
        {editing === 'priority' ? (
          <NativeSelect
            value={card.priority}
            autoFocus
            onChange={(e) => {
              void onPatch({ priority: e.target.value as BoardCardPriority })
              setEditing(null)
            }}
            className="h-7 text-xs"
            data-testid="card-priority-select"
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t(`card.priority.${value}`)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <CardPriorityIcon priority={card.priority} withLabel />
        )}
      </PrSidebarSection>

      <PrSidebarSection
        title={t('card.meta.dueDate')}
        testId="card-meta-due-date"
        onEdit={openEditor('dueDate')}
        editTitle={t('card.meta.editDueDate')}
      >
        {editing === 'dueDate' ? (
          <Input
            type="date"
            autoFocus
            defaultValue={card.dueDate ?? ''}
            onChange={(e) => {
              void onPatch({ dueDate: e.target.value || null })
              setEditing(null)
            }}
            className="h-7 text-xs"
            data-testid="card-due-date-input"
          />
        ) : card.dueDate ? (
          <span
            data-testid={overdue ? 'card-due-overdue' : 'card-due'}
            className={`flex items-center gap-1 text-[11px] ${
              overdue ? 'font-medium text-destructive' : 'text-foreground'
            }`}
          >
            <CalendarClock className="h-3 w-3 shrink-0" />
            {card.dueDate}
            {overdue && <span>({t('card.meta.overdue')})</span>}
            {/* Clearing lives here, beside the date, rather than inside the editor: a native date
                input doesn't reliably fire a change when it is emptied, so a clear button that only
                existed while editing was a clear button that mostly didn't work. */}
            {!readOnly && (
              <button
                type="button"
                title={t('card.meta.clearDueDate')}
                aria-label={t('card.meta.clearDueDate')}
                onClick={() => void onPatch({ dueDate: null })}
                data-testid="card-due-date-clear"
                className="ml-auto shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ) : (
          // A task doesn't necessarily have a deadline — this reads as a fact, not an empty field
          // waiting to be filled.
          <p className="text-xs italic text-muted-foreground" data-testid="card-due-none">
            {t('card.meta.noDueDate')}
          </p>
        )}
      </PrSidebarSection>

      <PrSidebarSection
        title={t('card.tags.label')}
        testId="card-meta-tags"
        onEdit={openEditor('tags')}
        editTitle={t('card.meta.editTags')}
      >
        {cardTags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {cardTags.map((tag) => (
              <li
                key={tag.id}
                data-testid={`card-meta-tag-${tag.id}`}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t('card.meta.noTags')}</p>
        )}
        {editing === 'tags' && (
          <CardTagPicker
            tags={tags}
            selectedIds={card.tagIds}
            onToggle={(tagId) =>
              void onPatch({
                tagIds: card.tagIds.includes(tagId)
                  ? card.tagIds.filter((id) => id !== tagId)
                  : [...card.tagIds, tagId],
              })
            }
            onCreate={onCreateTag ?? (() => Promise.resolve(null))}
            onClose={() => setEditing(null)}
          />
        )}
      </PrSidebarSection>

      <PrSidebarSection title={t('card.blocked.label')} testId="card-meta-blocked">
        {readOnly ? (
          card.blockedReason ? (
            <p className="flex items-start gap-1 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {card.blockedReason}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground">{t('card.meta.notBlocked')}</p>
          )
        ) : (
          <CardBlockedInlineEditor reason={card.blockedReason ?? ''} onPatch={onPatch} />
        )}
      </PrSidebarSection>

      {onCreateBranch && onCheckoutBranch && onUnlinkBranch && (
        <PrSidebarSection title={t('card.branch.label')} testId="card-meta-branch" className="border-b-0">
          <BoardCardBranchSection
            linkedBranch={card.linkedBranch}
            onCreateBranch={onCreateBranch}
            onCheckoutBranch={onCheckoutBranch}
            onUnlinkBranch={onUnlinkBranch}
            disabled={readOnly}
          />
        </PrSidebarSection>
      )}
    </div>
  )
}

/** Wraps `CardBlockedSection` so its toggle-and-reason pair commits on blur instead of waiting for a
 * dialog-wide Save that no longer exists. */
function CardBlockedInlineEditor({
  reason,
  onPatch,
}: {
  reason: string
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(reason)
  const [blocked, setBlocked] = useState(Boolean(reason))

  function commit(nextBlocked: boolean, nextReason: string) {
    const value = nextBlocked ? nextReason.trim() || null : null
    if ((value ?? '') === reason) return
    void onPatch({ blockedReason: value })
  }

  return (
    <div onBlur={() => commit(blocked, draft)}>
      <CardBlockedSection
        reason={draft}
        onChange={setDraft}
        blocked={blocked}
        onBlockedChange={(next) => {
          setBlocked(next)
          // Turning it off is unambiguous, so it saves at once; turning it on waits for a reason,
          // since a card cannot be blocked without one.
          if (!next) commit(false, '')
        }}
      />
    </div>
  )
}
