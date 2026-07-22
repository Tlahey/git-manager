import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Spinner,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { apiAnnotateTag } from '../../api/git.api'

interface AnnotateTagDialogProps {
  repoPath: string
  tagName: string
  oid: string
  open: boolean
  onClose: () => void
}

/** Adds an annotation message to an existing tag, recreating it as an annotated tag on the same commit. */
export function AnnotateTagDialog({ repoPath, tagName, oid, open, onClose }: AnnotateTagDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    const trimmed = message.trim()
    if (!trimmed) return
    setIsLoading(true)
    setError(null)
    try {
      await apiAnnotateTag(repoPath, tagName, oid, trimmed)
      queryClient.invalidateQueries({ queryKey: ['tags', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      setMessage('')
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="annotate-tag-dialog">
        <DialogHeader>
          <DialogTitle>{t('gitTree.tagMenu.annotate', { tag: tagName })}</DialogTitle>
          <DialogDescription>{t('gitTree.tagMenu.annotateDescription', { tag: tagName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('gitTree.contextMenu.tagMessagePlaceholder')}
            className="min-h-20"
            data-testid="annotate-tag-message"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!message.trim() || isLoading}
            className="gap-1.5"
            data-testid="annotate-tag-confirm"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.tagMenu.annotateConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
