import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from '@git-manager/i18n'
import type { GitHubAccount } from '@git-manager/git-types'
import type { MockIssue } from '../../../lib/github/types'
import { useSettingsStore } from '../../../stores/settings.store'
import { apiGetAppVersion } from '../../../api/updater.api'
import {
  apiCommentOnReportedIssue,
  apiCreateErrorIssue,
  apiFindReportedIssue,
} from '../api/errorReport.api'
import { buildErrorReport, type ErrorReport, type ErrorReportDraft } from '../lib/buildReport'
import { describePlatform } from '../lib/environment'
import { useErrorReportStore } from '../stores/errorReport.store'

/**
 * Everything the report dialog needs: the redacted report itself, whether it can be sent, whether
 * someone already sent it, and the two ways to submit.
 *
 * The report is rebuilt on every keystroke of the description rather than assembled at submit
 * time. That is the whole point of the preview — what the reporter reads has to be the exact string
 * that gets posted, not a rendering of something similar.
 */

export interface ErrorReportSubmission {
  kind: 'created' | 'commented'
  url: string
}

export interface UseErrorReportResult {
  /** The exact markdown that will be posted, plus the verdict on whether it should be. */
  report: ErrorReport
  /** The GitHub account that would file it, or `null` — the whole "connected" question. */
  account: GitHubAccount | null
  /** A previous report of the same failure, once the lookup resolves. */
  existing: MockIssue | null
  checkingDuplicate: boolean
  /** Set when this session already filed this exact failure. */
  alreadyReportedUrl: string | null
  submitting: boolean
  /** The outcome, once something was actually posted. */
  submission: ErrorReportSubmission | null
  submitError: string | null
  /** Files a new issue, or comments on `existing` — the dialog picks. */
  submit: (mode: 'create' | 'comment') => Promise<void>
}

export function useErrorReport(draft: ErrorReportDraft, description: string): UseErrorReportResult {
  const { i18n } = useTranslation('errors')
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const markReported = useErrorReportStore((s) => s.markReported)
  const reported = useErrorReportStore((s) => s.reported)

  const account =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const token = account?.token ?? null

  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<ErrorReportSubmission | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // The app version is the one piece of the environment that needs an await. It resolves once and
  // is cached by SWR for the session; until it does, the report says so rather than inventing a
  // number — a wrong version in a bug report costs a maintainer an afternoon.
  const { data: appVersion = 'unknown' } = useSWR('app-version', apiGetAppVersion, {
    revalidateOnFocus: false,
  })

  const report = useMemo(
    () =>
      buildErrorReport(
        draft,
        {
          appVersion,
          platform: describePlatform(navigator.userAgent),
          locale: i18n.language,
          userAgent: navigator.userAgent,
        },
        description
      ),
    [draft, appVersion, i18n.language, description]
  )

  // Keyed on the fingerprint, not the draft: two failures that will land on the same issue must
  // share one lookup. Skipped entirely without a token — the search API would rate-limit an
  // anonymous caller within a handful of crashes, and an unconnected user cannot file anything
  // anyway.
  const { data: existing = null, isLoading: checkingDuplicate } = useSWR(
    token ? ['error-report-duplicate', report.fingerprint, token] : null,
    ([, fingerprint, tok]) => apiFindReportedIssue(fingerprint, tok),
    {
      revalidateOnFocus: false,
      // A failed duplicate lookup must not block the report — worst case the maintainer gets a
      // duplicate, which is strictly better than losing the report.
      shouldRetryOnError: false,
      onError: (e) => console.warn('Duplicate report lookup failed', e),
    }
  )

  async function submit(mode: 'create' | 'comment') {
    if (!token) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (mode === 'comment' && existing) {
        await apiCommentOnReportedIssue(existing.number, report, token)
        setSubmission({ kind: 'commented', url: existing.url })
        markReported(report.fingerprint, existing.url)
      } else {
        const created = await apiCreateErrorIssue(report, token)
        setSubmission({ kind: 'created', url: created.url })
        markReported(report.fingerprint, created.url)
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    report,
    account,
    existing,
    checkingDuplicate,
    alreadyReportedUrl: reported[report.fingerprint] ?? null,
    submitting,
    submission,
    submitError,
    submit,
  }
}
