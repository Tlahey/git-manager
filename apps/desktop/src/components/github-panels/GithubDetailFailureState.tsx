import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { TriangleAlert } from 'lucide-react'
import {
  describeGithubDetailFailure,
  type GithubDetailFailure,
} from '../../hooks/githubDetailState'

const HEADLINE_KEY: Record<GithubDetailFailure['reason'], string> = {
  remotes: 'github.detail.errorRemotes',
  'no-github-remote': 'github.detail.errorNoRemote',
  'no-account': 'github.detail.errorNoAccount',
  fetch: 'github.detail.errorFetch',
}

interface GithubDetailFailureStateProps {
  failure: GithubDetailFailure
  onRetry: () => void
  /** Distinguishes the PR panel's element from the issue panel's in the DOM. */
  testId: string
}

/**
 * What a PR or issue detail panel shows instead of its content when it has nothing to show.
 *
 * The underlying message is rendered, not just a generic headline: the failure that motivated this
 * component said "No github credential is stored for '<login>'. Reconnect the account in Settings."
 * — the entire answer to "why is this empty?" — and the panel was discarding it in favour of an
 * endless spinner.
 */
export function GithubDetailFailureState({
  failure,
  onRetry,
  testId,
}: GithubDetailFailureStateProps) {
  const { t } = useTranslation('git')
  const detail = describeGithubDetailFailure(failure)

  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <TriangleAlert className="h-5 w-5 text-tone-danger" />
      <span className="text-xs text-muted-foreground">{t(HEADLINE_KEY[failure.reason])}</span>
      {detail ? (
        <span
          data-testid={`${testId}-detail`}
          className="max-w-md text-[11px] break-words text-muted-foreground/80"
        >
          {detail}
        </span>
      ) : null}
      <Button size="sm" variant="outline" onClick={onRetry} data-testid={`${testId}-retry`}>
        {t('github.detail.retry')}
      </Button>
    </div>
  )
}
