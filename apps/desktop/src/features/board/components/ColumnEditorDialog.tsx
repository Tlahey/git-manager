import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { BoardColumn } from '@git-manager/git-types'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Spinner,
} from '@git-manager/ui'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

interface ColumnEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: BoardColumn[]
  onSave: (columns: BoardColumn[]) => Promise<unknown>
}

/** A short, label-safe slug for a new column's id — see `remote-board.api.ts`'s doc comment on why a
 * remote board's column ids have to stay short (embedded in a `board:<id>:status:<col>` label). */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `col-${Date.now().toString(36)}`
}

function withOrder(columns: BoardColumn[]): BoardColumn[] {
  return columns.map((c, i) => ({ ...c, order: i }))
}

/** Add/rename/reorder/delete a board's columns — draft-then-save, so a half-finished edit never
 * writes a mutation (there is no autosave here, unlike the card fields). */
export function ColumnEditorDialog({
  open,
  onOpenChange,
  columns,
  onSave,
}: ColumnEditorDialogProps) {
  const { t } = useTranslation('board')
  const [draft, setDraft] = useState<BoardColumn[]>(columns)
  const [newName, setNewName] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) setDraft(columns)
  }, [open, columns])

  function addColumn() {
    if (!newName.trim()) return
    setDraft(withOrder([...draft, { id: slugify(newName), name: newName.trim(), order: 0 }]))
    setNewName('')
  }

  function renameColumn(id: string, name: string) {
    setDraft(draft.map((c) => (c.id === id ? { ...c, name } : c)))
  }

  /** Marks a column as one where work counts as finished — what drives the sprint report and which
   * cards carry over. Several columns may qualify (e.g. "Done" and "Shipped"). */
  function toggleDone(id: string, isDone: boolean) {
    setDraft(draft.map((c) => (c.id === id ? { ...c, isDone } : c)))
  }

  function removeColumn(id: string) {
    setDraft(withOrder(draft.filter((c) => c.id !== id)))
  }

  function moveColumn(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(withOrder(next))
  }

  async function handleSave() {
    setPending(true)
    try {
      await onSave(draft)
      onOpenChange(false)
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Each column is a row of name + done toggle + reorder + delete. */}
      <DialogContent data-testid="column-editor-dialog" size="lg">
        <DialogHeader>
          <DialogTitle>{t('columnEditor.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {draft.map((column, index) => (
            <div
              key={column.id}
              className="flex items-center gap-1.5"
              data-testid={`column-editor-row-${column.id}`}
            >
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-5"
                  disabled={index === 0}
                  onClick={() => moveColumn(index, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-5"
                  disabled={index === draft.length - 1}
                  onClick={() => moveColumn(index, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <Input
                value={column.name}
                onChange={(e) => renameColumn(column.id, e.target.value)}
                className="h-8 text-xs"
              />
              <label
                className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] whitespace-nowrap text-muted-foreground"
                title={t('columnEditor.isDoneHint')}
              >
                <Checkbox
                  checked={Boolean(column.isDone)}
                  onChange={(e) => toggleDone(column.id, e.target.checked)}
                  data-testid={`column-editor-done-${column.id}`}
                />
                {t('columnEditor.isDone')}
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeColumn(column.id)}
                data-testid={`column-editor-remove-${column.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <div className="flex items-center gap-1.5 pt-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addColumn()
              }}
              placeholder={t('columnEditor.newColumnPlaceholder')}
              className="h-8 text-xs"
              data-testid="column-editor-new-name"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={!newName.trim()}
              onClick={addColumn}
              data-testid="column-editor-add"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending || draft.length === 0}
            onClick={() => void handleSave()}
            data-testid="column-editor-save"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('columnEditor.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
