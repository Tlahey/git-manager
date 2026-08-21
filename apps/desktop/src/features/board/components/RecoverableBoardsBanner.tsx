import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Button, Spinner } from '@git-manager/ui'
import { History } from 'lucide-react'
import type { Board } from '@git-manager/git-types'

interface RecoverableBoardsBannerProps {
  boards: Board[]
  onRestore: (boardId: string) => Promise<Board>
}

/**
 * Surfaces boards the disaster-recovery mirror can bring back — the case where the repository itself
 * was deleted and re-cloned, wiping every board ref along with it (board refs are local-only and
 * never pushed). Nothing else in the app would tell the user these still exist, since a repo that has
 * lost its refs looks exactly like one that never had boards.
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
          {boards.map((board) => (
            <li key={board.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px]">{board.name}</span>
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
