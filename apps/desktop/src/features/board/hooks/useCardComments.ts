import { useEffect, useRef, useState } from 'react'
import type { BoardCard, BoardComment } from '@git-manager/git-types'

/**
 * A card's discussion, loaded when the card is opened.
 *
 * Only a remote card actually fetches: a local card carries its comments already, while a GitHub
 * card's live on GitHub and are pulled per card rather than with the board — fifty cards would
 * otherwise cost fifty extra requests on every board load, for a thread only the open dialog shows
 * (see `useBoardData.loadComments`).
 *
 * The loader and the card are held in refs and read inside the effect rather than listed as
 * dependencies. Both are rebuilt on every render of the page above, so depending on them directly
 * would re-fetch in a loop; what actually identifies a thread is the card's id and revision, and
 * keying on the revision is also what refreshes it after a comment is posted.
 */
export function useCardComments(
  card: BoardCard | null,
  load: (card: BoardCard) => Promise<BoardComment[]>
) {
  const [comments, setComments] = useState<BoardComment[]>([])
  const [loading, setLoading] = useState(false)

  const cardRef = useRef(card)
  cardRef.current = card
  const loadRef = useRef(load)
  loadRef.current = load

  const cardId = card?.id
  const revision = card?.revision

  useEffect(() => {
    const current = cardRef.current
    if (!current) {
      setComments([])
      return
    }
    let cancelled = false
    setLoading(true)
    void loadRef
      .current(current)
      .then((loaded) => {
        if (!cancelled) setComments(loaded)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardId, revision])

  return { comments, loading }
}
