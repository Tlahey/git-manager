import { useState } from 'react'
import { ArrowRight, FileText } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Badge, Button, Tooltip } from '@git-manager/ui'
import type { OutdatedPackage } from '@git-manager/git-types'

/** One `→ version` step of the chain, with the label that says which target it is. */
function VersionTarget({
  version,
  label,
  testId,
  emphasis,
}: {
  version: string
  label: string
  testId: string
  emphasis?: boolean
}) {
  return (
    <span className="flex shrink-0 items-center gap-1" data-testid={testId}>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className={`font-mono ${emphasis ? 'font-medium' : ''}`}>{version}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
  )
}

/**
 * One outdated dependency on a single line: name, what it moves from and to, and
 * the actions.
 *
 * The versions read as a chain — `current → wanted → latest` — so the starting
 * point is stated once and each target still shows explicitly what it lands on.
 * The two targets stay distinct because they carry different risk: the in-range
 * bump is what the manifests already allow, latest can cross a major, and that one
 * asks for confirmation rather than running on the first click.
 */
export function PackageUpdateRow({
  entry,
  busy,
  onUpdate,
  onShowChangelog,
}: {
  entry: OutdatedPackage
  busy: boolean
  onUpdate: (names: string[], toLatest: boolean) => void
  onShowChangelog: (entry: OutdatedPackage) => void
}) {
  const { t } = useTranslation('git')
  const [confirmingMajor, setConfirmingMajor] = useState(false)

  // pnpm reports `wanted === current` when the declared range has nothing newer;
  // only `latest` is then actionable.
  const hasInRangeUpdate = entry.wanted !== entry.current
  const hasLatestUpdate = entry.latest !== entry.wanted

  function requestLatest() {
    if (entry.majorUpdate) setConfirmingMajor(true)
    else onUpdate([entry.name], true)
  }

  return (
    <li
      className="rounded border border-border bg-card px-2 py-1.5"
      data-testid="package-update-row"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.name}>
          {entry.name}
        </span>

        {entry.deprecated && (
          <Badge variant="destructive" className="shrink-0 text-[9px]">
            {t('health.outdated.deprecated')}
          </Badge>
        )}
        {entry.majorUpdate && (
          <Badge variant="warning" className="shrink-0 text-[9px]">
            {t('health.outdated.major')}
          </Badge>
        )}

        <span
          className="flex shrink-0 items-center gap-1.5 text-[11px]"
          data-testid="version-chain"
        >
          <span className="font-mono text-muted-foreground" data-testid="version-current">
            {entry.current}
          </span>
          {hasInRangeUpdate && (
            <VersionTarget
              version={entry.wanted}
              label={t('health.updates.inRange')}
              testId="jump-in-range"
              emphasis
            />
          )}
          {hasLatestUpdate && (
            <VersionTarget
              version={entry.latest}
              label={t('health.updates.latest')}
              testId="jump-latest"
              emphasis={!hasInRangeUpdate}
            />
          )}
        </span>

        {/* Each tooltip names the version the button would land on, rather than
            repeating its label — on a row this dense, the useful thing to reveal on
            hover is the consequence, and the icon-only button has no label at all. */}
        <span className="flex shrink-0 items-center gap-1">
          {hasInRangeUpdate && (
            <Tooltip content={t('health.updates.updateInRangeTooltip', { version: entry.wanted })}>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onUpdate([entry.name], false)}
                data-testid="update-in-range"
              >
                {t('health.updates.updateInRange')}
              </Button>
            </Tooltip>
          )}
          <Tooltip
            content={t(
              entry.majorUpdate
                ? 'health.updates.updateLatestMajorTooltip'
                : 'health.updates.updateLatestTooltip',
              { version: entry.latest }
            )}
          >
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={requestLatest}
              data-testid="update-latest"
            >
              {t('health.updates.updateLatest')}
            </Button>
          </Tooltip>
          <Tooltip
            content={t('health.changelog.showTooltip', {
              from: entry.current,
              to: entry.latest,
            })}
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onShowChangelog(entry)}
              aria-label={t('health.changelog.show')}
              data-testid="toggle-changelog"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </span>
      </div>

      {confirmingMajor && (
        <Alert variant="warning" className="mt-1.5" data-testid="major-confirm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-[11px]">{t('health.updates.majorWarning')}</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmingMajor(false)
                onUpdate([entry.name], true)
              }}
              data-testid="major-confirm-accept"
            >
              {t('health.updates.majorConfirm')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingMajor(false)}
              data-testid="major-confirm-cancel"
            >
              {t('health.updates.cancel')}
            </Button>
          </div>
        </Alert>
      )}
    </li>
  )
}
