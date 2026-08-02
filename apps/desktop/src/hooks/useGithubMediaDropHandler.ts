import { useCallback, type DragEvent } from 'react'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { openUrl } from '../lib/openUrl'

const MEDIA_TYPE_PREFIXES = ['image/', 'video/']

function hasDroppedMedia(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.files).some((file) =>
    MEDIA_TYPE_PREFIXES.some((prefix) => file.type.startsWith(prefix))
  )
}

/**
 * GitHub has no public API to upload an image/video attachment to an issue or PR — only its web UI's
 * session-authenticated upload endpoint can do that — so a media file dropped onto one of these
 * textareas can never be attached from here. Dropping one instead opens the matching GitHub page (when
 * one already exists) so the user can drop it there, and always explains why via a toast so the drop
 * doesn't look like a silent no-op.
 */
export function useGithubMediaDropHandler(githubUrl: string | null | undefined) {
  const { t } = useTranslation('git')

  const onDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (!hasDroppedMedia(e.dataTransfer)) return
      e.preventDefault()
      if (githubUrl) {
        void openUrl(githubUrl)
        toast.info(t('mediaDrop.openedBrowser'))
      } else {
        toast.info(t('mediaDrop.noTarget'))
      }
    },
    [githubUrl, t]
  )

  return { onDragOver, onDrop }
}
