import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { parseUnifiedDiff, type DiffLine } from './parseUnifiedDiff'

interface PrFileDiffProps {
  patch: string | undefined
  status: string
}

const LINE_BG: Record<DiffLine['type'], string> = {
  add: 'bg-green-500/10',
  del: 'bg-destructive/10',
  context: '',
}

const MARKER: Record<DiffLine['type'], string> = { add: '+', del: '-', context: ' ' }

/** Renders a GitHub `patch` (unified diff for one PR file) as coloured hunks with old/new line
 * numbers — a self-contained diff view (no file contents needed, so no Monaco). */
export function PrFileDiff({ patch, status }: PrFileDiffProps) {
  const { t } = useTranslation('git')
  const hunks = useMemo(() => parseUnifiedDiff(patch ?? ''), [patch])

  if (!patch) {
    return (
      <p className="p-4 text-xs italic text-muted-foreground" data-testid="pr-file-diff-empty">
        {status === 'renamed' ? t('pr.diff.renamedOnly') : t('pr.diff.noPatch')}
      </p>
    )
  }

  return (
    <div data-testid="pr-file-diff" className="overflow-x-auto font-mono text-[11px] leading-relaxed">
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          <div className="bg-primary/5 px-2 py-1 text-[11px] text-muted-foreground">{hunk.header}</div>
          {hunk.lines.map((line, li) => (
            <div key={li} className={`flex ${LINE_BG[line.type]}`}>
              <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground">
                {line.oldNo ?? ''}
              </span>
              <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground">
                {line.newNo ?? ''}
              </span>
              <span
                className={`w-4 shrink-0 select-none text-center ${
                  line.type === 'add'
                    ? 'text-green-500'
                    : line.type === 'del'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                }`}
              >
                {MARKER[line.type]}
              </span>
              <span className="whitespace-pre px-1 text-foreground">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
