import { ChevronLeft, ExternalLink, GitMerge, GitPullRequest, XCircle, Circle } from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { Markdown } from '../../../components/Markdown'
import { usePrOverview } from '../../../hooks/usePrOverview'
import { StatusBadge, CiBadge } from './Badges'
import { PrChecksList } from './PrChecksList'
import { openUrl, timeAgo } from '../utils'
import type { MockPR } from '../types'

interface PrViewPanelProps {
  pr: MockPR
  onClose: () => void
}

function StatusIcon({ pr }: { pr: MockPR }) {
  if (pr.status === 'merged') return <GitMerge className="h-4 w-4 shrink-0 text-purple-400" />
  if (pr.status === 'closed') return <XCircle className="h-4 w-4 shrink-0 text-destructive" />
  if (pr.isDraft) return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
  return <GitPullRequest className="h-4 w-4 shrink-0 text-green-400" />
}

/**
 * The Launchpad's own read-focused pull-request view — a deliberately self-contained panel (not the
 * repo graph's interactive PR view) that works for any listed PR without its repo being cloned
 * locally. Shows the title/status, the full CI checks list with a link to each run, reviewers and
 * labels, and the description. The top-left Back button returns to the list the user came from.
 */
export function PrViewPanel({ pr, onClose }: PrViewPanelProps) {
  const { t } = useTranslation('launchpad')
  const { body, isLoading } = usePrOverview(pr.fullName, pr.number)
  const trimmed = body.trim()

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="launchpad-pr-view">
      {/* Header with the Back button (top-left) and a GitHub escape hatch */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          onClick={onClose}
          data-testid="launchpad-pr-back"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('prView.back')}
        </button>
        <span className="ml-1 truncate font-mono text-[11px] text-muted-foreground/70">
          {pr.repo}
        </span>
        <button
          onClick={() => openUrl(pr.url)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('row.openOnGitHub')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-5">
          {/* Title + summary */}
          <div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                <StatusIcon pr={pr} />
              </div>
              <h1 className="text-base font-semibold leading-snug text-foreground">
                {pr.title}{' '}
                <span className="font-mono text-sm font-normal text-muted-foreground/60">
                  #{pr.number}
                </span>
              </h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <StatusBadge status={pr.status} />
              <span className="flex items-center gap-1.5">
                <img
                  src={pr.authorAvatar}
                  alt={pr.author}
                  className="rounded-full border border-border bg-muted object-cover"
                  style={{ width: 16, height: 16 }}
                />
                {pr.author}
              </span>
              <span>
                {t('prView.opened')} {timeAgo(pr.createdAt)}
              </span>
              <span>
                {t('prView.updated')} {timeAgo(pr.updatedAt)}
              </span>
              {(pr.additions > 0 || pr.deletions > 0 || pr.filesChanged > 0) && (
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  <span className="text-green-400">+{pr.additions}</span>
                  <span className="text-red-400">−{pr.deletions}</span>
                  {pr.filesChanged > 0 && (
                    <span className="text-muted-foreground/50">
                      · {t('row.filesCount', { count: pr.filesChanged })}
                    </span>
                  )}
                </span>
              )}
            </div>
            {pr.labels.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {pr.labels.map((l) => (
                  <span
                    key={l}
                    className="rounded border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* CI checks with links to each run */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('prView.checks')}
              </h2>
              <CiBadge status={pr.ciStatus} details={pr.ciDetails} prUrl={pr.url} />
            </div>
            <PrChecksList details={pr.ciDetails ?? []} />
          </section>

          {/* Reviewers */}
          {pr.collaborators.length > 0 && (
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('prView.reviewers')}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {pr.collaborators.map((c) => (
                  <span
                    key={c.login}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-0.5 pr-2 text-[11px] text-muted-foreground"
                  >
                    <img
                      src={c.avatar}
                      alt={c.login}
                      className="rounded-full object-cover"
                      style={{ width: 16, height: 16 }}
                    />
                    {c.login}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Description */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('prView.description')}
            </h2>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" /> {t('prView.loading')}
              </div>
            ) : trimmed ? (
              <div className="text-sm text-foreground/90">
                <Markdown content={trimmed} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">{t('prView.noDescription')}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
