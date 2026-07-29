import { useCallback, useState } from 'react'

/**
 * Backs the clickable task-list checkboxes of an editable markdown document (a PR or issue body).
 *
 * The checkbox has no state of its own — it renders whatever the source says — so between the click
 * and the server's answer the tick would spring back unless the rewritten source is shown right
 * away. Hence the optimistic copy, dropped once the write settles: by then the caller has awaited
 * its own revalidation and `content` carries the saved body, and on failure dropping it is exactly
 * the revert.
 *
 * Pass `save: null` when the document isn't the user's to edit — the returned `onTaskToggle` is then
 * `undefined`, which is what keeps the checkboxes read-only.
 */
export function useMarkdownTaskToggle(
  content: string,
  save: ((next: string) => Promise<unknown>) | null
) {
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const toggle = useCallback(
    (next: string) => {
      if (!save) return
      setOptimistic(next)
      setPending(true)
      void (async () => {
        try {
          await save(next)
        } catch {
          // Reported by the caller's own save path; dropping the optimistic copy reverts the tick.
        } finally {
          setOptimistic(null)
          setPending(false)
        }
      })()
    },
    [save]
  )

  return {
    /** The body to render: the pending rewrite while a toggle is in flight, the source otherwise. */
    content: optimistic ?? content,
    onTaskToggle: save ? toggle : undefined,
    pending,
  }
}
