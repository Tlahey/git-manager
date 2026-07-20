import type { GitDiffFile } from '@git-manager/git-types'
import { Badge } from '@git-manager/ui'
import { cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

interface DiffViewerProps {
  file: GitDiffFile
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  added: 'diffToolbar.status.added',
  modified: 'diffToolbar.status.modified',
  deleted: 'diffToolbar.status.deleted',
  renamed: 'diffToolbar.status.renamed',
  copied: 'diffToolbar.status.copied',
  typechange: 'diffToolbar.status.typechange',
}

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  added: 'success',
  modified: 'secondary',
  deleted: 'destructive',
  renamed: 'warning',
  copied: 'success',
  typechange: 'secondary',
}

export function DiffViewer({ file }: DiffViewerProps) {
  const { t } = useTranslation('git')
  const displayPath = file.status === 'renamed' ? `${file.oldPath} → ${file.newPath}` : file.newPath

  return (
    <div className="overflow-hidden rounded-md border border-border font-mono text-xs">
      {/* Header fichier */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="flex-1 truncate text-foreground">{displayPath}</span>
        <Badge variant={STATUS_VARIANTS[file.status] ?? 'secondary'}>
          {file.status in STATUS_LABEL_KEYS ? t(STATUS_LABEL_KEYS[file.status]) : file.status}
        </Badge>
        {!file.isBinary && (
          <span className="whitespace-nowrap text-muted-foreground">
            <span className="text-green-400">+{file.additions}</span>{' '}
            <span className="text-red-400">-{file.deletions}</span>
          </span>
        )}
      </div>

      {/* Contenu diff */}
      {file.isBinary ? (
        <div className="px-3 py-2 italic text-muted-foreground">{t('diffViewer.binaryFile')}</div>
      ) : (
        <div className="overflow-x-auto">
          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              {/* En-tête du hunk */}
              <div className="bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-400/80">
                {hunk.header}
              </div>
              {/* Lignes du hunk */}
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={cn(
                    'flex items-start px-0 leading-5',
                    line.origin === '+' && 'bg-green-500/10',
                    line.origin === '-' && 'bg-red-500/10'
                  )}
                >
                  {/* Numéros de lignes */}
                  <span className="w-10 shrink-0 select-none border-r border-border pr-2 text-right text-muted-foreground/50">
                    {line.oldLineno ?? ''}
                  </span>
                  <span className="w-10 shrink-0 select-none border-r border-border pr-2 text-right text-muted-foreground/50">
                    {line.newLineno ?? ''}
                  </span>
                  {/* Origine (+/-/espace) */}
                  <span
                    className={cn(
                      'w-5 shrink-0 select-none text-center',
                      line.origin === '+' && 'text-green-400',
                      line.origin === '-' && 'text-red-400',
                      line.origin === ' ' && 'text-muted-foreground/40'
                    )}
                  >
                    {line.origin === ' ' ? '' : line.origin}
                  </span>
                  {/* Contenu */}
                  <span
                    className={cn(
                      'flex-1 whitespace-pre pl-1',
                      line.origin === '+' && 'text-green-300',
                      line.origin === '-' && 'text-red-300',
                      line.origin === ' ' && 'text-foreground/70'
                    )}
                  >
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
