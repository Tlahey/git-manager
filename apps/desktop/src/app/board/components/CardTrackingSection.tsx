import { useTranslation } from '@git-manager/i18n'
import type { BoardCard } from '@git-manager/git-types'
import { Badge, Button, Tooltip } from '@git-manager/ui'
import { CheckCircle2, CircleDot, ExternalLink, Link2Off, WifiOff } from 'lucide-react'
import { apiOpenUrl } from '../../../api/shell.api'

interface CardTrackingSectionProps {
  card: BoardCard
  onUntrack: () => Promise<unknown>
  readOnly?: boolean
}

/**
 * What a card tracks, for a card on a local board that follows a GitHub issue.
 *
 * It states the consequence rather than leaving it to be discovered: the fields on this card are the
 * issue's, so editing them edits a real issue in the repository. That is worth saying out loud on the
 * card itself — nothing else on screen distinguishes a tracked card from a local one at edit time.
 *
 * `issueState` being absent means the issue could not be fetched, which is a different thing from
 * being open or closed and is shown as such: the content on screen is the last known copy.
 */
export function CardTrackingSection({ card, onUntrack, readOnly }: CardTrackingSectionProps) {
  const { t } = useTranslation('board')
  const ref = card.sourceIssue
  if (!ref) return null

  const url = `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`
  const label = `${ref.owner}/${ref.repo}#${ref.number}`

  return (
    <div className="space-y-2" data-testid="card-tracking">
      <div className="flex items-center gap-1.5">
        <Tooltip content={label}>
          <Button
            variant="outline"
            size="sm"
            className="h-6 min-w-0 flex-1 justify-start gap-1.5 px-1.5 text-[11px]"
            onClick={() => void apiOpenUrl(url)}
            data-testid="card-tracking-link"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">#{ref.number}</span>
          </Button>
        </Tooltip>

        {card.issueState === undefined ? (
          <Tooltip content={t('card.tracking.unreachable')}>
            <Badge variant="outline" className="gap-1 text-[10px]" data-testid="card-tracking-unreachable">
              <WifiOff className="h-3 w-3" />
            </Badge>
          </Tooltip>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 text-[10px]"
            data-testid={`card-tracking-state-${card.issueState}`}
          >
            {card.issueState === 'closed' ? (
              <CheckCircle2 className="h-3 w-3 text-tone-info" />
            ) : (
              <CircleDot className="h-3 w-3 text-tone-success" />
            )}
            {t(`card.tracking.${card.issueState}`)}
          </Badge>
        )}
      </div>

      <p className="text-[10px] italic text-muted-foreground">{t('card.tracking.syncNote')}</p>

      {!readOnly && (
        <Tooltip content={t('card.tracking.untrackHint')}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => void onUntrack()}
            data-testid="card-tracking-untrack"
          >
            <Link2Off className="h-3 w-3 shrink-0" />
            {t('card.tracking.untrack')}
          </Button>
        </Tooltip>
      )}
    </div>
  )
}
