import { ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

interface FixupDiffToolbarProps {
  ignoreWhitespace: boolean
  onChangeIgnoreWhitespace: (ignore: boolean) => void
  changeCount: number
  onPrevChange: () => void
  onNextChange: () => void
}

/**
 * Toolbar of the "Commit changes" diff section: change navigation,
 * whitespace dropdown on the left, difference count on the right
 * (JetBrains commit-dialog style).
 */
export function FixupDiffToolbar({
  ignoreWhitespace,
  onChangeIgnoreWhitespace,
  changeCount,
  onPrevChange,
  onNextChange,
}: FixupDiffToolbarProps) {
  const { t } = useTranslation('git')

  const selectClass =
    'h-6 rounded border border-border bg-card px-2 text-[11px] text-foreground outline-none hover:bg-accent/40'

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPrevChange} title={t('gitTree.fixupDialog.prevChange')}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNextChange} title={t('gitTree.fixupDialog.nextChange')}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>

      <select
        className={selectClass}
        value={ignoreWhitespace ? 'ignore' : 'keep'}
        onChange={(e) => onChangeIgnoreWhitespace(e.target.value === 'ignore')}
        data-testid="fixup-diff-whitespace"
      >
        <option value="keep">{t('gitTree.fixupDialog.doNotIgnore')}</option>
        <option value="ignore">{t('gitTree.fixupDialog.ignoreWhitespace')}</option>
      </select>

      <span className="ml-auto text-[11px] text-muted-foreground" data-testid="fixup-diff-count">
        {t('gitTree.fixupDialog.diffCount', { count: changeCount })}
      </span>
    </div>
  )
}
