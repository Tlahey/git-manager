import type { GitDiffFile } from '@git-manager/git-types'
import { Badge } from '@git-manager/ui'
import { cn } from '@git-manager/ui'

interface DiffViewerProps {
  file: GitDiffFile
}

const STATUS_LABELS: Record<string, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  typechange: 'Typechange',
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
  const displayPath = file.status === 'renamed'
    ? `${file.oldPath} → ${file.newPath}`
    : file.newPath

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs font-mono">
      {/* Header fichier */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="flex-1 truncate text-foreground">{displayPath}</span>
        <Badge variant={STATUS_VARIANTS[file.status] ?? 'secondary'}>
          {STATUS_LABELS[file.status] ?? file.status}
        </Badge>
        {!file.isBinary && (
          <span className="text-muted-foreground whitespace-nowrap">
            <span className="text-green-400">+{file.additions}</span>
            {' '}
            <span className="text-red-400">-{file.deletions}</span>
          </span>
        )}
      </div>

      {/* Contenu diff */}
      {file.isBinary ? (
        <div className="px-3 py-2 text-muted-foreground italic">Binary file</div>
      ) : (
        <div className="overflow-x-auto">
          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              {/* En-tête du hunk */}
              <div className="px-2 py-0.5 bg-blue-500/10 text-blue-400/80 text-[11px]">
                {hunk.header}
              </div>
              {/* Lignes du hunk */}
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={cn(
                    'flex items-start leading-5 px-0',
                    line.origin === '+' && 'bg-green-500/10',
                    line.origin === '-' && 'bg-red-500/10',
                  )}
                >
                  {/* Numéros de lignes */}
                  <span className="w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none border-r border-border">
                    {line.oldLineno ?? ''}
                  </span>
                  <span className="w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none border-r border-border">
                    {line.newLineno ?? ''}
                  </span>
                  {/* Origine (+/-/espace) */}
                  <span
                    className={cn(
                      'w-5 shrink-0 text-center select-none',
                      line.origin === '+' && 'text-green-400',
                      line.origin === '-' && 'text-red-400',
                      line.origin === ' ' && 'text-muted-foreground/40',
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
                      line.origin === ' ' && 'text-foreground/70',
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
