import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'

interface TagCreationInputProps {
  /**
   * `inline` renders a bare name input meant to sit in the row's refs (branch/tag) column;
   * `bar` renders a labelled input with Submit/Cancel buttons, used at the top of the graph when
   * the refs column is hidden and there's no row cell to host the inline input.
   */
  variant: 'inline' | 'bar'
  /** Called with the trimmed, non-empty tag name when the user confirms. */
  onSubmit: (name: string) => void
  onCancel: () => void
}

/**
 * The inline tag-name entry used when creating a (lightweight or annotated) tag from the graph's
 * commit context menu, replacing the former modal dialog. Both variants collect a name only — the
 * annotated/lightweight choice is decided by the menu item, not here. Enter confirms, Escape cancels.
 */
export function TagCreationInput({ variant, onSubmit, onCancel }: TagCreationInputProps) {
  const { t } = useTranslation('git')
  const [name, setName] = useState('')
  const trimmed = name.trim()

  function handleSubmit() {
    if (!trimmed) return
    onSubmit(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  if (variant === 'bar') {
    return (
      <div
        className="flex shrink-0 items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary"
        data-testid="tag-creation-bar"
      >
        <span className="shrink-0 font-medium">{t('gitTree.tagCreation.barLabel')}</span>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('gitTree.tagCreation.barPlaceholder')}
          className="h-7 max-w-xs flex-1 text-xs"
          data-testid="tag-creation-bar-input"
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!trimmed}
          data-testid="tag-creation-bar-submit"
        >
          {t('gitTree.tagCreation.submit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="tag-creation-bar-cancel"
        >
          {t('gitTree.contextMenu.cancel')}
        </Button>
      </div>
    )
  }

  return (
    <Input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={handleKeyDown}
      // A click in the input must not bubble up to the row's select handler.
      onClick={(e) => e.stopPropagation()}
      // Dismiss when focus leaves an empty input (e.g. the user clicks elsewhere without typing).
      onBlur={() => {
        if (!trimmed) onCancel()
      }}
      placeholder={t('gitTree.tagCreation.placeholder')}
      className="h-6 w-full rounded-sm bg-primary/10 px-1.5 text-[11px]"
      data-testid="tag-creation-inline-input"
    />
  )
}
