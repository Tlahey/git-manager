import { useTranslation } from '@git-manager/i18n'
import { BookOpen, X, RefreshCw, FileText } from 'lucide-react'
import { Markdown } from '../../../components/Markdown'
import { useRepoReadme } from '../../../hooks/useRepoReadme'

interface ReadmePanelProps {
  path: string
  onClose: () => void
}

export function ReadmePanel({ path, onClose }: ReadmePanelProps) {
  const { t } = useTranslation('dashboard')
  const { data: content, isLoading, error } = useRepoReadme(path)
  const loading = isLoading || (content === undefined && !error)

  const name = path.split('/').pop() || path

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card shadow-2xl min-w-0">
      {/* Pane Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-xs text-foreground truncate">{name}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pane content */}
      <div className="flex-1 overflow-y-auto p-5 select-text bg-card/10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full py-8 space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Chargement du README...</p>
          </div>
        ) : error || content === undefined ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground/60 p-4">
            <FileText className="h-10 w-10 mb-2 opacity-20 text-muted-foreground" />
            <p className="text-xs font-sans">{t('dashboard.noReadme') || 'Aucun fichier README trouvé.'}</p>
          </div>
        ) : (
          <Markdown content={content} />
        )}
      </div>
    </div>
  )
}
