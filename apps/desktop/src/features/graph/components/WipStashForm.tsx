import { Archive } from 'lucide-react'
import { Button, Textarea, Checkbox, Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitStatus } from '@git-manager/git-types'
import type { WipCommitPanelState } from './wipPanelState'

interface WipStashFormProps {
  panel: WipCommitPanelState
  gitStatus: GitStatus | undefined
}

/** The stash half of the WIP panel: an optional message, the untracked toggle, and the button. */
export function WipStashForm({ panel, gitStatus }: WipStashFormProps) {
  const { t } = useTranslation('git')
  const { stashMessage, setStashMessage, includeUntracked, setIncludeUntracked, isStashing } = panel

  // Nothing anywhere in the working tree means nothing to stash — staged, unstaged and untracked
  // all count, since `git stash` takes all three.
  const nothingToStash =
    (gitStatus?.staged?.length ?? 0) === 0 &&
    (gitStatus?.unstaged?.length ?? 0) === 0 &&
    (gitStatus?.untracked?.length ?? 0) === 0

  return (
    <div className="space-y-3">
      <Textarea
        data-testid="stash-message-input"
        value={stashMessage}
        onChange={(e) => setStashMessage(e.target.value)}
        placeholder={t('stash.pushDialog.placeholder', {
          defaultValue: 'Stash message (optional)...',
        })}
        rows={3}
        className="resize-none font-mono text-xs"
      />

      {/* Checkbox placement: BELOW the text area */}
      <label
        data-testid="stash-untracked-checkbox-label"
        className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground select-none hover:text-foreground"
      >
        <Checkbox
          data-testid="stash-untracked-checkbox"
          checked={includeUntracked}
          onChange={(e) => setIncludeUntracked(e.target.checked)}
        />
        <span>
          {t('stash.pushDialog.includeUntracked', {
            defaultValue: 'Inclure les fichiers non suivis',
          })}
        </span>
      </label>

      <Button
        size="sm"
        data-testid="stash-submit-button"
        className="h-8 w-full gap-1.5 text-xs"
        onClick={panel.handleStash}
        disabled={isStashing || nothingToStash}
      >
        {isStashing ? <Spinner className="mr-1.5 h-3 w-3" /> : <Archive className="h-3.5 w-3.5" />}
        <span>{t('stash.push', { defaultValue: 'Stash changes' })}</span>
      </Button>
    </div>
  )
}
