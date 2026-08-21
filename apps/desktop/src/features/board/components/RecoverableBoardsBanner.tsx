import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Button, Spinner } from '@git-manager/ui'
import { History } from 'lucide-react'
import type { Board, RecoverableBoard } from '@git-manager/git-types'

interface RecoverableBoardsBannerProps {
  boards: RecoverableBoard[]
  onRestore: (boardId: string) => Promise<Board>
}

/** The board's own last-changed stamp, as a date *and* a time: several clones of the same repository
 * lost on the same day is exactly the case this line exists to disambiguate. */
function formatChangedAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * Surfaces boards the disaster-recovery mirror can bring back — the case where the repository itself
 * was deleted and re-cloned, wiping every board ref along with it (board refs are local-only and
 * never pushed). Nothing else in the app would tell the user these still exist, since a repo that has
 * lost its refs looks exactly like one that never had boards.
 *
 * **Every row says more than the name**, because the name is the one thing that does not distinguish
 * them: a board is named after a sprint, and two lost clones of the same repository offer two
 * "Sprint 12" with nothing to choose by. When it last changed and how many cards it holds are what
 * answer "which one was mine" — and the list arrives newest first (`list_recoverable_boards`), which
 * is the likelier one.
 *
 * One restore in flight at a time, tracked locally: a board that already lost its live ref restoring
 * twice concurrently would race two "recreate the ref" writes against each other.
 */
export function RecoverableBoardsBanner({ boards, onRestore }: RecoverableBoardsBannerProps) {
  const { t } = useTranslation('board')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  if (boards.length === 0) return null

  async function restore(boardId: string) {
    setRestoringId(boardId)
    try {
      await onRestore(boardId)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div
      className="shrink-0 border-b border-sidebar-border p-2"
      data-testid="recoverable-boards-banner"
    >
      <Alert variant="info" icon={<History className="h-3.5 w-3.5" />} role="status">
        <p className="text-xs font-medium">{t('recoverable.title', { count: boards.length })}</p>
        <ul className="mt-1.5 space-y-1">
          {boards.map(({ board, cardCount }) => (
            <li key={board.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[11px]">{board.name}</span>
                <span
                  className="truncate text-[10px] text-muted-foreground"
                  data-testid={`recoverable-board-detail-${board.id}`}
                >
                  {t('recoverable.detail', {
                    count: cardCount,
                    date: formatChangedAt(board.updatedAt),
                  })}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px]"
                disabled={restoringId !== null}
                onClick={() => void restore(board.id)}
                data-testid={`recoverable-board-restore-${board.id}`}
              >
                {restoringId === board.id ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  t('recoverable.restore')
                )}
              </Button>
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  )
}
