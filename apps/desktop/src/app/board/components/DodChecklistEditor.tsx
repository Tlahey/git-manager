import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Checkbox, Input } from '@git-manager/ui'
import { Plus, Trash2 } from 'lucide-react'
import { addItem, parseDodItems, removeItem, setItemDone, setItemText } from '../dodChecklist'

interface DodChecklistEditorProps {
  /** Markdown task list — the stored form on both a card and a board's template. */
  value: string
  onChange: (next: string) => void
  /** Hides the tick boxes: a *template* has no state to tick, only items to list. */
  hideChecks?: boolean
  disabled?: boolean
}

/**
 * Edits a Definition of Done as the list of items it is, rather than as the markdown it is stored as.
 *
 * Shared by a card's checklist and a board's template so the two are edited the same way — the
 * template used to be a raw markdown box, which asked the user to know the `- [ ]` syntax to fill in
 * a list of sentences.
 *
 * Items are addressed by line number, so anything in the document that isn't a checkbox survives
 * untouched — see `dodChecklist.ts`.
 */
export function DodChecklistEditor({
  value,
  onChange,
  hideChecks,
  disabled,
}: DodChecklistEditorProps) {
  const { t } = useTranslation('board')
  const [draftItem, setDraftItem] = useState('')
  const items = parseDodItems(value)

  function submitDraft() {
    if (!draftItem.trim()) return
    onChange(addItem(value, draftItem))
    setDraftItem('')
  }

  return (
    <div className="space-y-0.5" data-testid="dod-checklist-editor">
      {items.map((item) => (
        <div
          key={item.index}
          className="group flex items-center gap-2"
          data-testid={`card-dod-item-${item.index}`}
        >
          {hideChecks ? (
            <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
          ) : (
            <Checkbox
              checked={item.done}
              disabled={disabled}
              aria-label={item.text}
              onChange={(e) => onChange(setItemDone(value, item.index, e.target.checked))}
              data-testid={`card-dod-check-${item.index}`}
            />
          )}

          {disabled ? (
            <span
              className={`min-w-0 flex-1 text-xs ${
                item.done ? 'text-muted-foreground line-through' : 'text-foreground'
              }`}
            >
              {item.text}
            </span>
          ) : (
            <>
              <Input
                variant="ghost"
                inputSize="sm"
                defaultValue={item.text}
                onBlur={(e) => {
                  if (e.target.value.trim() !== item.text) {
                    onChange(setItemText(value, item.index, e.target.value.trim()))
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className={`h-6 min-w-0 flex-1 text-xs ${
                  item.done ? 'line-through opacity-60' : ''
                }`}
                data-testid={`card-dod-text-${item.index}`}
              />
              <button
                type="button"
                onClick={() => onChange(removeItem(value, item.index))}
                title={t('card.dod.removeItem')}
                aria-label={t('card.dod.removeItem')}
                data-testid={`card-dod-remove-${item.index}`}
                className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="flex items-center gap-2 pt-0.5">
          <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Input
            variant="ghost"
            inputSize="sm"
            value={draftItem}
            onChange={(e) => setDraftItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitDraft()
            }}
            onBlur={submitDraft}
            placeholder={t('card.dod.addItem')}
            className="h-6 min-w-0 flex-1 text-xs"
            data-testid="card-dod-add-input"
          />
        </div>
      )}
    </div>
  )
}
