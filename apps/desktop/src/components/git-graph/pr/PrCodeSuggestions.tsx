import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { MessageSquareCode } from 'lucide-react'
import { usePrReviewThreads } from '../../../hooks/usePrReviewThreads'
import { PrSidebarSection } from './PrSidebarSection'

interface PrCodeSuggestionsProps {
  repoPath: string
  prNumber: number
}

/** Right-panel section listing the PR's unresolved review threads ("code suggestions" still open).
 * Each row links out to its comment on GitHub. Hidden entirely when everything is resolved. */
export function PrCodeSuggestions({ repoPath, prNumber }: PrCodeSuggestionsProps) {
  const { t } = useTranslation('git')
  const { threads, isLoading } = usePrReviewThreads(repoPath, prNumber)

  // Nothing unresolved (and not still loading) → don't take up space.
  if (!isLoading && threads.length === 0) return null

  return (
    <PrSidebarSection
      title={`${t('pr.suggestions.title')}${threads.length > 0 ? ` (${threads.length})` : ''}`}
      testId="pr-code-suggestions"
    >
      {isLoading && threads.length === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Spinner className="h-3 w-3" /> {t('pr.suggestions.loading')}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {threads.map((th) => (
            <li key={th.id}>
              <a
                href={th.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`pr-suggestion-${th.id}`}
                className="block rounded-md border border-border p-2 hover:bg-accent"
              >
                <div className="flex items-center gap-1.5 text-[11px]">
                  <MessageSquareCode className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate font-mono text-foreground" title={th.path}>
                    {th.path}
                    {th.line != null ? `:${th.line}` : ''}
                  </span>
                  {th.isOutdated && (
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t('pr.suggestions.outdated')}
                    </span>
                  )}
                </div>
                {th.snippet && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{th.snippet}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">{th.author}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </PrSidebarSection>
  )
}
