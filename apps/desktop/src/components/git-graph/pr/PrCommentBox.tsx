import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Textarea } from '@git-manager/ui'
import { usePrActions } from '../../../hooks/usePrActions'

interface PrCommentBoxProps {
  repoPath: string
  prNumber: number
}

/** A plain comment box (issue-style comment on the PR), separate from the formal review composer. */
export function PrCommentBox({ repoPath, prNumber }: PrCommentBoxProps) {
  const { t } = useTranslation('git')
  const { comment, pending } = usePrActions(repoPath, prNumber)
  const [body, setBody] = useState('')

  async function submit() {
    if (!body.trim()) return
    await comment(body.trim())
    setBody('')
  }

  return (
    <section data-testid="pr-comment-box" className="border-t border-border px-4 py-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('pr.comment.placeholder')}
        rows={3}
        className="text-xs"
        data-testid="pr-comment-input"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={!body.trim() || pending}
          onClick={submit}
          data-testid="pr-comment-submit"
        >
          {pending && <Spinner className="h-3 w-3" />}
          {t('pr.comment.submit')}
        </Button>
      </div>
    </section>
  )
}
