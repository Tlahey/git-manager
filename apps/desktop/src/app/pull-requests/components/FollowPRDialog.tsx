import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

interface FollowPRDialogProps {
  onAdd: (url: string) => void
  onClose: () => void
}

export function FollowPRDialog({ onAdd, onClose }: FollowPRDialogProps) {
  const { t } = useTranslation('launchpad')
  const [url, setUrl] = useState('')
  const isValid = url.includes('github.com') && url.includes('/pull/')

  function handleAdd() {
    if (isValid) {
      onAdd(url.trim())
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" />
            {t('followDialog.title')}
          </DialogTitle>
        </DialogHeader>

        <Input
          type="url"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="https://github.com/owner/repo/pull/123"
        />

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('followDialog.cancel')}
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={!isValid}>
            {t('followDialog.follow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
