import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Spinner,
} from '@git-manager/ui'
import { Plus, Trash2, X } from 'lucide-react'
import type { BoardTag } from '@git-manager/git-types'
import { defaultCardPrefix, nextTagColor, tagIdFromName } from '../lib/boardDefaults'
import { AssignIdentifiersRow } from './AssignIdentifiersRow'
import { DodChecklistEditor } from './DodChecklistEditor'

interface BoardSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  tags: BoardTag[]
  dodTemplate: string
  /** The prefixes this board offers at card creation — see {@link Board.cardPrefixes}. */
  cardPrefixes: string[]
  /** How many of the board's cards carry no identifier — see {@link AssignIdentifiersRow}. Zero on a
   * board that has nothing to repair, and on a closed one, which is read-only. */
  unnumberedCardCount: number
  /** Numbers those cards, from the prefix given. Immediate, unlike everything else here. */
  onAssignIdentifiers: (prefix: string) => Promise<number>
  onSave: (
    name: string,
    tags: BoardTag[],
    dodTemplate: string,
    cardPrefixes: string[]
  ) => Promise<unknown>
}

/**
 * The board's own settings: name, tag palette, and the Definition-of-Done template new cards start
 * from. Columns keep their own dialog — reordering a workflow and editing a board's settings are
 * different gestures, even though both write `board.json`.
 *
 * Draft-then-save, like `ColumnEditorDialog`: a half-renamed tag never reaches a mutation. That
 * matters more here than it looks, because on a GitHub board saving pushes each tag to the repo as a
 * real label.
 */
export function BoardSettingsDialog({
  open,
  onOpenChange,
  name,
  tags,
  dodTemplate,
  cardPrefixes,
  unnumberedCardCount,
  onAssignIdentifiers,
  onSave,
}: BoardSettingsDialogProps) {
  const { t } = useTranslation('board')
  const [draftName, setDraftName] = useState(name)
  const [draftTags, setDraftTags] = useState<BoardTag[]>(tags)
  const [draftDod, setDraftDod] = useState(dodTemplate)
  const [draftPrefixes, setDraftPrefixes] = useState<string[]>(cardPrefixes)
  const [newPrefix, setNewPrefix] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraftName(name)
    setDraftTags(tags)
    setDraftDod(dodTemplate)
    setDraftPrefixes(cardPrefixes)
    setNewPrefix('')
    setNewTagName('')
  }, [open, name, tags, dodTemplate, cardPrefixes])

  /** Normalized and de-duplicated on the way in, so the list never holds two spellings of one
   * prefix. Removing one here only stops it being *offered* — cards already carrying it keep it. */
  function addPrefix() {
    const normalized = newPrefix.trim().toUpperCase()
    if (!normalized || draftPrefixes.includes(normalized)) return
    setDraftPrefixes((all) => [...all, normalized])
    setNewPrefix('')
  }

  function addTag() {
    const trimmed = newTagName.trim()
    if (!trimmed) return
    const id = tagIdFromName(trimmed)
    if (draftTags.some((tag) => tag.id === id)) return
    setDraftTags([...draftTags, { id, name: trimmed, color: nextTagColor(draftTags.length) }])
    setNewTagName('')
  }

  async function handleSave() {
    if (!draftName.trim()) return
    setPending(true)
    try {
      await onSave(draftName.trim(), draftTags, draftDod, draftPrefixes)
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
      {/* Tag rows pair a colour swatch with a name and a delete button, and the checklist editor is
          a column of its own — three controls per line don't fit the default width. */}
      <DialogContent
        data-testid="board-settings-dialog"
        size="lg"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('boardSettings.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('boardSettings.nameLabel')}
            </Label>
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              disabled={pending}
              className="h-8 text-xs"
              data-testid="board-settings-name"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('boardSettings.prefixLabel')}
            </Label>
            {draftPrefixes.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" data-testid="board-settings-prefixes">
                {draftPrefixes.map((prefix) => (
                  <li
                    key={prefix}
                    className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                    data-testid={`board-settings-prefix-${prefix}`}
                  >
                    {prefix}
                    <button
                      type="button"
                      onClick={() => setDraftPrefixes((all) => all.filter((p) => p !== prefix))}
                      aria-label={t('boardSettings.removePrefix', { prefix })}
                      disabled={pending}
                      className="cursor-pointer rounded text-muted-foreground hover:text-destructive"
                      data-testid={`board-settings-prefix-remove-${prefix}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-1.5">
              <Input
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addPrefix()
                  }
                }}
                placeholder={t('createBoard.prefixPlaceholder')}
                disabled={pending}
                maxLength={10}
                className="h-8 text-xs uppercase"
                data-testid="board-settings-prefix"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={pending || !newPrefix.trim()}
                onClick={addPrefix}
                data-testid="board-settings-prefix-add"
              >
                {t('boardSettings.addPrefix')}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">{t('boardSettings.prefixHint')}</p>
            {/* Numbered from the prefix on screen — the one just typed, if that is what's there:
                assigning registers it on the board, so pressing this before Save can't produce a
                sequence the board doesn't know about. */}
            <AssignIdentifiersRow
              count={unnumberedCardCount}
              prefix={draftPrefixes[0] ?? defaultCardPrefix(draftName)}
              onAssign={onAssignIdentifiers}
              disabled={pending}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('boardSettings.tagsLabel')}
            </Label>
            <p className="text-[10px] text-muted-foreground">{t('boardSettings.tagsHint')}</p>
            <div className="space-y-1.5">
              {draftTags.map((tag, index) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-1.5"
                  data-testid={`board-settings-tag-${tag.id}`}
                >
                  <input
                    type="color"
                    value={tag.color}
                    disabled={pending}
                    aria-label={tag.name}
                    onChange={(e) => {
                      const next = [...draftTags]
                      next[index] = { ...tag, color: e.target.value }
                      setDraftTags(next)
                    }}
                    className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    data-testid={`board-settings-tag-color-${tag.id}`}
                  />
                  <Input
                    value={tag.name}
                    disabled={pending}
                    onChange={(e) => {
                      const next = [...draftTags]
                      next[index] = { ...tag, name: e.target.value }
                      setDraftTags(next)
                    }}
                    className="h-7 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    disabled={pending}
                    aria-label={t('boardSettings.removeTag')}
                    onClick={() => setDraftTags(draftTags.filter((c) => c.id !== tag.id))}
                    data-testid={`board-settings-remove-tag-${tag.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-1.5">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTag()
                  }}
                  placeholder={t('boardSettings.newTagPlaceholder')}
                  disabled={pending}
                  className="h-7 text-xs"
                  data-testid="board-settings-new-tag"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={pending || !newTagName.trim()}
                  aria-label={t('boardSettings.addTag')}
                  onClick={addTag}
                  data-testid="board-settings-add-tag"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('boardSettings.dodLabel')}
            </Label>
            <p className="text-[10px] text-muted-foreground">{t('boardSettings.dodHint')}</p>
            {/* A list, not a markdown box: the template is a set of sentences, and asking the user
                to know the `- [ ]` syntax to write them was the only reason it looked like code. */}
            <div data-testid="board-settings-dod">
              <DodChecklistEditor
                value={draftDod}
                onChange={setDraftDod}
                hideChecks
                disabled={pending}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending || !draftName.trim()}
            onClick={() => void handleSave()}
            data-testid="board-settings-save"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('boardSettings.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
