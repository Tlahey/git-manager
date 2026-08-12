import { useTranslation } from '@git-manager/i18n'
import { ScrollArea } from '@git-manager/ui'
import { CopyToClipboard } from '../../../components/common/CopyToClipboard'

/**
 * The exact body that will be posted, shown in full and never summarised.
 *
 * **This is a redaction control, not a courtesy.** `lib/publicRedact.ts` strips paths, argument
 * values and token-shaped strings, and no set of regexes deserves to be the only thing between a
 * user's disk and a public URL. The person who owns the data reads it before it leaves, and the
 * copy button means the reporter who decides against sending still keeps everything they need to
 * file it by hand — which is the whole experience for anyone with no GitHub account connected.
 */
export function ReportPreview({ body }: { body: string }) {
  const { t } = useTranslation('errors')

  return (
    <div className="min-h-0 flex-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] tracking-wide text-muted-foreground/60 uppercase">
          {t('report.preview.label')}
        </span>
        <CopyToClipboard
          textToCopy={body}
          copiedLabel={t('report.copied')}
          aria-label={t('report.copy')}
          title={t('report.copy')}
          data-testid="error-report-copy"
          className="text-[10px] text-muted-foreground/70"
        >
          {t('report.copy')}
        </CopyToClipboard>
      </div>
      <ScrollArea className="h-48 rounded-md border border-border/60 bg-muted/20">
        <pre
          data-testid="error-report-preview"
          className="p-2 font-mono text-[10px] break-all whitespace-pre-wrap text-muted-foreground"
        >
          {body}
        </pre>
      </ScrollArea>
      <p className="mt-1 text-[10px] text-muted-foreground/70">{t('report.preview.hint')}</p>
    </div>
  )
}
