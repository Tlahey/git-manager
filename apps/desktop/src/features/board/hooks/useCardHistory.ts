import { useEffect, useRef, useState } from 'react'
import type { BoardCard, CardHistoryEntry } from '@git-manager/git-types'

/**
 * One card's history, loaded when the card is opened — the same bespoke-effect shape as
 * `useCardComments`, for the same reason: local-only, cheap, and scoped to the open dialog rather
 * than something worth a shared cache.
 *
 * Local-only by construction: `load` is only ever `apiGetCardHistory`, which has no remote-backend
 * equivalent (see `local-board.api.ts`). The caller decides whether to invoke this hook at all —
 * passing `null` for a remote card, the same way `columns`/`boardName` are omitted in `EditProps`
 * for a card rendered outside a board.
 */
export function useCardHistory(
  card: BoardCard | null,
  load: (card: BoardCard) => Promise<CardHistoryEntry[]>
) {
  const [history, setHistory] = useState<CardHistoryEntry[]>([])
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
      setHistory([])
      return
    }
    let cancelled = false
    setLoading(true)
    void loadRef
      .current(current)
      .then((loaded) => {
        if (!cancelled) setHistory(loaded)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardId, revision])

  return { history, loading }
}
