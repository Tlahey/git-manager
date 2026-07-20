import { X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { CreatePatchPanel } from './CreatePatchPanel'
import { ApplyPatchPanel } from './ApplyPatchPanel'
import { DependencyPatchPanel } from './DependencyPatchPanel'

/** Right-panel shell for the patch workspace: a titled header (the mode's name +
 * close) over the mode-specific panel. */
export function PatchWorkspacePanel({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const mode = usePatchWorkspaceStore((s) => s.mode)
  const close = usePatchWorkspaceStore((s) => s.close)
  if (!mode) return null

  const title =
    mode === 'apply'
      ? t('patch.apply.title')
      : mode === 'dependency'
        ? t('patch.dependency.title')
        : t('patch.create.title')

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="patch-panel-title">
          {title}
        </span>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t('patch.cancel')}
          data-testid="patch-workspace-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'create' && <CreatePatchPanel repoPath={repoPath} />}
        {mode === 'apply' && <ApplyPatchPanel repoPath={repoPath} />}
        {mode === 'dependency' && <DependencyPatchPanel repoPath={repoPath} />}
      </div>
    </div>
  )
}
