import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Textarea } from '@git-manager/ui'
import { Check, X, MessageSquare } from 'lucide-react'
import type { PrReviewEvent } from '../../../api/github.api'
import { usePrActions } from '../../../hooks/usePrActions'

interface PrReviewComposerProps {
  repoPath: string
  prNumber: number
}

/** GitHub-style "Submit a review": a body plus Approve / Request changes / Comment actions. */
export function PrReviewComposer({ repoPath, prNumber }: PrReviewComposerProps) {
  const { t } = useTranslation('git')
  const { submitReview, pending } = usePrActions(repoPath, prNumber)
  const [body, setBody] = useState('')

  async function submit(event: PrReviewEvent) {
    await submitReview({ event, body: body.trim() || undefined })
    setBody('')
  }

  return (
    <section data-testid="pr-review-composer" className="border-t border-border px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold text-foreground">{t('pr.review.title')}</h3>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('pr.review.bodyPlaceholder')}
        rows={3}
        className="text-xs"
        data-testid="pr-review-input"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={pending}
          onClick={() => submit('APPROVE')}
          data-testid="pr-review-approve"
        >
          {pending ? <Spinner className="h-3 w-3" /> : <Check className="h-3.5 w-3.5 text-green-500" />}
          {t('pr.review.approve')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={pending}
          onClick={() => submit('REQUEST_CHANGES')}
          data-testid="pr-review-request-changes"
        >
          <X className="h-3.5 w-3.5 text-destructive" />
          {t('pr.review.requestChanges')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          disabled={pending}
          onClick={() => submit('COMMENT')}
          data-testid="pr-review-comment"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {t('pr.review.comment')}
        </Button>
      </div>
    </section>
  )
}
