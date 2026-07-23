import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea } from '@git-manager/ui'
import { Bug, Check, X, SkipForward } from 'lucide-react'
import { useBisectState } from '../../hooks/useBisectState'
import { useBisectActions } from '../../hooks/useBisectActions'

interface BisectPanelProps {
  repoPath: string
}

/** A short-OID chip with a colored dot, used to list the good/bad/skipped commits. */
function OidChip({ oid, dotClass }: { oid: string; dotClass: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {oid.slice(0, 7)}
    </span>
  )
}

/**
 * Right-hand panel shown during a bisect: details of the commit currently under test, the search
 * progress, the good/bad/skip validation buttons (mirroring the top banner for ergonomics), and a
 * recap of the commits already marked. Rendered in the graph's right slot with top priority.
 */
export function BisectPanel({ repoPath }: BisectPanelProps) {
  const { t } = useTranslation('git')
  const { data: bisect } = useBisectState(repoPath)
  const { mark, reset, pending } = useBisectActions(repoPath)

  if (!bisect?.active) return null

  const finished = !!bisect.firstBadOid
  const shortOid = bisect.currentOid?.slice(0, 7)

  return (
    <div className="flex h-full flex-col bg-background" data-testid="bisect-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bug className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">{t('bisect.panel.title')}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          {/* Progress */}
          {!finished && bisect.stepsRemaining != null && (
            <div className="rounded-md border border-border bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground">
                {t('bisect.panel.progress', {
                  steps: bisect.stepsRemaining,
                  revs: bisect.revsRemaining ?? 0,
                })}
              </p>
            </div>
          )}

          {/* Commit under test */}
          {!finished && shortOid && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('bisect.panel.underTest')}
              </p>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="font-mono text-xs text-amber-600 dark:text-amber-400">{shortOid}</p>
                {bisect.currentSummary && (
                  <p className="mt-1 text-sm">{bisect.currentSummary}</p>
                )}
                {bisect.currentAuthor && (
                  <p className="mt-1 text-xs text-muted-foreground">{bisect.currentAuthor}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  size="sm"
                  className="gap-1 bg-green-600 text-xs text-white hover:bg-green-700"
                  disabled={pending}
                  onClick={() => mark('good')}
                  data-testid="bisect-panel-good"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t('bisect.actions.good')}
                </Button>
                <Button
                  size="sm"
                  className="gap-1 bg-red-600 text-xs text-white hover:bg-red-700"
                  disabled={pending}
                  onClick={() => mark('bad')}
                  data-testid="bisect-panel-bad"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('bisect.actions.bad')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs"
                  disabled={pending}
                  onClick={() => mark('skip')}
                  data-testid="bisect-panel-skip"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  {t('bisect.actions.skip')}
                </Button>
              </div>
            </div>
          )}

          {/* Marked commits recap */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('bisect.panel.marked')}
            </p>
            <div className="space-y-2 text-xs">
              {bisect.badOid && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('bisect.panel.bad')}</span>
                  <OidChip oid={bisect.badOid} dotClass="bg-red-500" />
                </div>
              )}
              {bisect.goodOids.length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">{t('bisect.panel.good')}</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {bisect.goodOids.map((oid) => (
                      <OidChip key={oid} oid={oid} dotClass="bg-green-500" />
                    ))}
                  </div>
                </div>
              )}
              {bisect.skippedOids.length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">{t('bisect.panel.skipped')}</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {bisect.skippedOids.map((oid) => (
                      <OidChip key={oid} oid={oid} dotClass="bg-muted-foreground" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-border p-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          disabled={pending}
          onClick={reset}
          data-testid="bisect-panel-reset"
        >
          {finished ? t('bisect.result.finish') : t('bisect.actions.abort')}
        </Button>
      </div>
    </div>
  )
}
