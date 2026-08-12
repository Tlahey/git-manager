import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { CheckCircle2, ExternalLink, Loader2, SendHorizontal } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@git-manager/ui'
import { apiOpenUrl } from '../../../api/shell.api'
import { PROJECT_ISSUES_URL } from '../../../lib/projectRepo'
import { useErrorReport } from '../hooks/useErrorReport'
import type { ErrorReportDraft } from '../lib/buildReport'
import { ReportVerdictBanner } from './ReportVerdictBanner'
import { ReportPreview } from './ReportPreview'

/**
 * The whole reporting flow, in one dialog: what the app thinks of the failure, what the reporter
 * wants to add, the exact body that will be posted, and the one button that posts it.
 *
 * **Nothing is ever sent without this dialog.** There is no background reporting and no "send
 * diagnostics" setting — the app is local-only by design, and an automatic error upload would be
 * telemetry whatever it was called. A report leaves the machine when a person reads it and clicks.
 *
 * **Without a connected GitHub account it degrades to a copy button**, deliberately: filing on the
 * user's behalf would need a bot token and a server, which is the same telemetry by another route.
 * They get the finished, redacted body and a link to the tracker.
 */
export function ErrorReportDialog({
  draft,
  open,
  onClose,
}: {
  draft: ErrorReportDraft
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('errors')
  const [description, setDescription] = useState('')
  const [confirmedNotABug, setConfirmedNotABug] = useState(false)

  const {
    report,
    account,
    existing,
    checkingDuplicate,
    alreadyReportedUrl,
    submitting,
    submission,
    submitError,
    submit,
  } = useErrorReport(draft, description)

  // `unclear` is the verdict for `GIT_ERROR` and friends, where the code cannot tell a defect from
  // git refusing something reasonable. The reporter's own words are the missing evidence, so the
  // report doesn't go out without them.
  const needsDescription = report.verdict === 'unclear' && description.trim().length === 0
  const blockedAsExpected = report.verdict === 'expected' && !confirmedNotABug
  const canSubmit = account !== null && !submitting && !needsDescription && !blockedAsExpected

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg" data-testid="error-report-dialog">
        <DialogHeader>
          <DialogTitle>{t('report.title')}</DialogTitle>
          <DialogDescription>{t('report.subtitle')}</DialogDescription>
        </DialogHeader>

        {submission ? (
          <Alert variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            <p className="font-medium">
              {submission.kind === 'created'
                ? t('report.success.created')
                : t('report.success.commented')}
            </p>
            <button
              type="button"
              onClick={() => apiOpenUrl(submission.url)}
              data-testid="error-report-view-issue"
              className="mt-1 inline-flex cursor-pointer items-center gap-1 underline"
            >
              <ExternalLink className="h-3 w-3" />
              {submission.url}
            </button>
          </Alert>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <ReportVerdictBanner verdict={report.verdict} reasonKey={report.reasonKey} />

            {alreadyReportedUrl && (
              <Alert variant="info" data-testid="error-report-already-sent">
                {t('report.alreadyReported')}
              </Alert>
            )}

            {existing && (
              <Alert variant="warning" data-testid="error-report-duplicate">
                <p className="font-medium">
                  {t('report.duplicate.title', { number: existing.number })}
                </p>
                <p className="mt-0.5 opacity-90">{t('report.duplicate.body')}</p>
                <button
                  type="button"
                  onClick={() => apiOpenUrl(existing.url)}
                  className="mt-1 inline-flex cursor-pointer items-center gap-1 underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('report.duplicate.view')}
                </button>
              </Alert>
            )}

            <div>
              <Label htmlFor="error-report-description">{t('report.description.label')}</Label>
              <Textarea
                id="error-report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('report.description.placeholder')}
                data-testid="error-report-description"
                className="mt-1 min-h-[72px]"
              />
              {needsDescription && (
                <p className="mt-1 text-[10px] text-tone-warning">{t('report.needDescription')}</p>
              )}
            </div>

            <ReportPreview body={report.body} />

            {report.verdict === 'expected' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="error-report-anyway"
                  checked={confirmedNotABug}
                  onChange={(e) => setConfirmedNotABug(e.target.checked)}
                  data-testid="error-report-anyway"
                />
                <Label htmlFor="error-report-anyway" className="text-xs font-normal">
                  {t('report.reportAnyway')}
                </Label>
              </div>
            )}

            {!account && (
              <Alert variant="info" data-testid="error-report-not-connected">
                <p className="font-medium">{t('report.notConnected.title')}</p>
                <p className="mt-0.5 opacity-90">{t('report.notConnected.body')}</p>
                <button
                  type="button"
                  onClick={() => apiOpenUrl(PROJECT_ISSUES_URL)}
                  data-testid="error-report-open-tracker"
                  className="mt-1 inline-flex cursor-pointer items-center gap-1 underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('report.notConnected.open')}
                </button>
              </Alert>
            )}

            {submitError && (
              <Alert variant="destructive" data-testid="error-report-error">
                {t('report.failed', { error: submitError })}
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="error-report-close">
            {t('report.close')}
          </Button>
          {!submission && account && (
            <>
              {existing && (
                <Button
                  variant="outline"
                  onClick={() => submit('comment')}
                  disabled={!canSubmit}
                  data-testid="error-report-comment"
                >
                  {t('report.duplicate.comment')}
                </Button>
              )}
              <Button
                onClick={() => submit('create')}
                disabled={!canSubmit || checkingDuplicate}
                data-testid="error-report-submit"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SendHorizontal className="h-3.5 w-3.5" />
                )}
                {existing ? t('report.duplicate.createAnyway') : t('report.submit')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
