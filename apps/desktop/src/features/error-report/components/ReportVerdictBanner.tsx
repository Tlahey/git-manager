import { useTranslation } from '@git-manager/i18n'
import { AlertTriangle, Bug, HelpCircle } from 'lucide-react'
import { Alert } from '@git-manager/ui'
import type { ReportVerdict } from '../lib/reportability.config'

/**
 * Tells the reporter what the app thinks of their failure before they spend a paragraph describing
 * it — the "is this really a bug" step, made visible.
 *
 * It is advice, not a gate, for the two verdicts that aren't certain: an `expected` failure can
 * still be reported (the dialog makes the reporter tick a box first), because the classification
 * table is a heuristic and the person in front of the app knows something it does not. What it
 * buys is that the common case — a protected branch, a hook that said no — is *explained* rather
 * than filed, which is the difference between a tracker a maintainer reads and one they don't.
 */
const VERDICT_STYLE: Record<
  ReportVerdict,
  { variant: 'info' | 'warning' | 'destructive'; icon: typeof Bug; titleKey: string }
> = {
  bug: { variant: 'destructive', icon: Bug, titleKey: 'report.verdict.bug' },
  unclear: { variant: 'warning', icon: HelpCircle, titleKey: 'report.verdict.unclear' },
  expected: { variant: 'info', icon: AlertTriangle, titleKey: 'report.verdict.expected' },
}

export function ReportVerdictBanner({
  verdict,
  reasonKey,
}: {
  verdict: ReportVerdict
  reasonKey: string
}) {
  const { t } = useTranslation('errors')
  const { variant, icon: Icon, titleKey } = VERDICT_STYLE[verdict]

  return (
    <Alert
      variant={variant}
      icon={<Icon className="h-3.5 w-3.5" />}
      data-testid={`report-verdict-${verdict}`}
    >
      <p className="font-medium">{t(titleKey)}</p>
      <p className="mt-0.5 opacity-90">{t(reasonKey)}</p>
    </Alert>
  )
}
