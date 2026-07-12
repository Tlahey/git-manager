import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Spinner,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { apiCreateTag } from '../../api/git.api'

interface TagDialogProps {
  repoPath: string
  oid: string
  shortOid: string
  annotated: boolean
  open: boolean
  onClose: () => void
}

/** Crée un tag (léger ou annoté) pointant sur un commit donné. */
export function TagDialog({ repoPath, oid, shortOid, annotated, open, onClose }: TagDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed) return
    setIsLoading(true)
    setError(null)
    try {
      await apiCreateTag(repoPath, trimmed, oid, annotated ? message.trim() : undefined)
      queryClient.invalidateQueries({ queryKey: ['tags', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      setName('')
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {annotated
              ? t('gitTree.contextMenu.createAnnotatedTag')
              : t('gitTree.contextMenu.createTag')}
          </DialogTitle>
          <DialogDescription>{t('gitTree.createBranch.from', { sha: shortOid })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('gitTree.createBranch.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !annotated) handleConfirm()
            }}
          />
          {annotated && (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('gitTree.contextMenu.tagMessagePlaceholder')}
              className="min-h-20 w-full rounded border border-border bg-background p-2 text-sm"
            />
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim() || isLoading}
            className="gap-1.5"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.contextMenu.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
