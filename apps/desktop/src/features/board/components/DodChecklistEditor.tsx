import { useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Checkbox, Input } from '@git-manager/ui'
import { Plus, Trash2 } from 'lucide-react'
import { addItem, parseDodItems, removeItem, setItemDone, setItemText } from '../lib/dodChecklist'

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
 * Shared by a card's checklist, a board's template and the new-card form so the three are edited the
 * same way — each of them used to be a raw markdown box, which asked the user to know the `- [ ]`
 * syntax to fill in a list of sentences.
 *
 * The last row is a live draft field rather than a button that spawns an empty item: an item with no
 * text is not a state the stored markdown can hold, so a row is only added once there is something
 * to add — by Enter, by leaving the field, or by the `+` beside it.
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
  const draftRef = useRef<HTMLInputElement>(null)
  const items = parseDodItems(value)

  function submitDraft() {
    if (!draftItem.trim()) return
    onChange(addItem(value, draftItem))
    setDraftItem('')
  }

  /**
   * The `+` commits what is typed and hands the caret straight back, so a template is filled in one
   * pass rather than one click per item; on an empty draft it is simply the way into the field, which
   * is what makes the affordance discoverable to someone who never tried typing in the row below it.
   */
  function addFromButton() {
    submitDraft()
    draftRef.current?.focus()
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
                className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-destructive focus:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="flex items-center gap-2 pt-0.5">
          {/* `onMouseDown` is prevented so the draft field keeps focus: the blur handler would
              otherwise commit the item first and leave this click with nothing to add. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addFromButton}
            title={t('card.dod.addItemAction')}
            aria-label={t('card.dod.addItemAction')}
            data-testid="card-dod-add-button"
            className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
          <Input
            ref={draftRef}
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
