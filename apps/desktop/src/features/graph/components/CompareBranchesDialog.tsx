import { ArrowLeftRight } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  NativeSelect,
  Spinner,
} from '@git-manager/ui'
import { useBranches } from '../../../hooks/useBranches'
import { useRefComparison } from '../hooks/useRefComparison'
import { DiffFilesPanel } from './DiffFilesPanel'

interface CompareBranchesDialogProps {
  repoPath: string
  /** Left ("from") side of the diff. The order is not cosmetic — swapping the two is another diff. */
  baseRef: string
  /** Right ("to") side of the diff. */
  headRef: string
  open: boolean
  /** Re-picking either side (or swapping them) reports the new pair to the owner of the state. */
  onChangeRefs: (baseRef: string, headRef: string) => void
  onClose: () => void
}

/**
 * Diffs two arbitrary refs against each other — the "compare two branches" view.
 *
 * Reuses {@link DiffFilesPanel} (the same body as the commit-vs-working-directory dialog) rather
 * than rendering patches its own way: a second diff renderer would drift from the first the first
 * time either is touched — as it had, until this dialog's own copy of the list was folded back in.
 * What is specific here is only the pair of refs on top, which the user can re-pick without
 * reopening the dialog.
 *
 * The two sides are a plain branch list, not a free-text field: the backend accepts any revspec, but
 * offering one would put "did I type the ref right?" between the user and the answer.
 */
export function CompareBranchesDialog({
  repoPath,
  baseRef,
  headRef,
  open,
  onChangeRefs,
  onClose,
}: CompareBranchesDialogProps) {
  const { t } = useTranslation('git')
  const { data: branches = [] } = useBranches(repoPath)
  const {
    data: diff,
    isLoading,
    error,
  } = useRefComparison(open ? repoPath : null, baseRef, headRef)

  // `name` (not `shortName`): it is what the backend resolves, and the only one that tells a local
  // `feature` apart from `origin/feature` — both of which carry the short name "feature".
  const options = branches.map((b) => b.name)
  // A ref the repo no longer lists (a deleted branch, a tag, a raw SHA) still has to be selectable,
  // or the select would silently show a *different* ref than the one being compared.
  for (const ref of [baseRef, headRef]) {
    if (ref && !options.includes(ref)) options.push(ref)
  }

  const sameRef = baseRef === headRef
  const fileCount = diff?.files.length ?? 0

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="compare-branches-dialog"
        className="flex max-h-[80vh] max-w-3xl flex-col"
      >
        <DialogHeader>
          <DialogTitle>{t('gitTree.compareBranches.title')}</DialogTitle>
          <DialogDescription>{t('gitTree.compareBranches.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">
              {t('gitTree.compareBranches.base')}
            </span>
            <NativeSelect
              value={baseRef}
              aria-label={t('gitTree.compareBranches.base')}
              data-testid="compare-branches-base"
              onChange={(e) => onChangeRefs(e.target.value, headRef)}
            >
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </label>

          <Button
            variant="ghost"
            size="icon"
            title={t('gitTree.compareBranches.swap')}
            aria-label={t('gitTree.compareBranches.swap')}
            data-testid="compare-branches-swap"
            onClick={() => onChangeRefs(headRef, baseRef)}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>

          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">
              {t('gitTree.compareBranches.head')}
            </span>
            <NativeSelect
              value={headRef}
              aria-label={t('gitTree.compareBranches.head')}
              data-testid="compare-branches-head"
              onChange={(e) => onChangeRefs(baseRef, e.target.value)}
            >
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>

        {!sameRef && diff && fileCount > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="compare-branches-summary">
            {t('gitTree.compareBranches.fileCount', { count: fileCount })}{' '}
            <span className="text-green-400">+{diff.totalAdditions}</span>{' '}
            <span className="text-red-400">-{diff.totalDeletions}</span>
          </p>
        )}

        {sameRef ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t('gitTree.compareBranches.sameRef')}
          </p>
        ) : error ? (
          <p
            className="py-6 text-center text-xs text-destructive"
            data-testid="compare-branches-error"
          >
            {t('gitTree.compareBranches.failed', {
              // `invoke` already unwraps an `AppError` payload into an Error carrying its message
              // (see `toReadableError`), so this is the backend's own wording, not a JSON blob.
              error: error instanceof Error ? error.message : String(error),
            })}
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <DiffFilesPanel
            diff={diff}
            isLoading={false}
            emptyMessage={t('gitTree.compareBranches.noDifferences')}
            testId="compare-branches-files"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
