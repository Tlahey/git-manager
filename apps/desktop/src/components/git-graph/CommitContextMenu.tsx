import { useTranslation } from '@git-manager/i18n'
import {
  Pencil,
  FilePen,
  Combine,
  Layers,
  Repeat,
  GitGraph as GitGraphIcon,
  Cherry,
  Trash2,
  LogIn,
  SkipBack,
  RotateCcw,
  Copy,
  Tag,
  GitBranchPlus,
} from 'lucide-react'
import { ContextMenuSurface } from './ContextMenuSurface'
import type { ContextMenuPosition } from '../../hooks/useContextMenu'

interface CommitContextMenuProps {
  position: ContextMenuPosition
  menuRef: React.RefObject<HTMLDivElement>
  /** Nombre de commits ciblés (sélection courante). */
  targetCount: number
  onClose: () => void
  onReset: () => void
  onRevert: () => void
  onCreateBranch: () => void
  onCopySha: () => void
  onFixup: () => void
}

interface ItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  soonTitle?: string
}

function MenuItem({ icon: Icon, label, onClick, disabled, danger, soonTitle }: ItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? soonTitle : undefined}
      className={[
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors',
        'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        danger ? 'text-destructive' : 'text-foreground',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-border" />
}

/** Menu contextuel d'actions sur un ou plusieurs commits (clic droit / icône ⋮). */
export function CommitContextMenu({
  position,
  menuRef,
  targetCount,
  onClose,
  onReset,
  onRevert,
  onCreateBranch,
  onCopySha,
  onFixup,
}: CommitContextMenuProps) {
  const { t } = useTranslation('git')
  const soon = t('gitTree.contextMenu.soon')
  const isSingle = targetCount === 1

  function run(fn: () => void) {
    return () => {
      onClose()
      fn()
    }
  }

  return (
    <ContextMenuSurface position={position} ref={menuRef} width={236}>
      {targetCount > 1 && (
        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">
          {t('gitTree.contextMenu.selectedCount', { count: targetCount })}
        </div>
      )}

      {/* Édition */}
      <SectionLabel>{t('gitTree.contextMenu.sectionEdit')}</SectionLabel>
      <MenuItem icon={Pencil} label={t('gitTree.contextMenu.reword')} disabled soonTitle={soon} />
      <MenuItem icon={FilePen} label={t('gitTree.contextMenu.editCommit')} disabled soonTitle={soon} />

      <Divider />

      {/* Historique */}
      <SectionLabel>{t('gitTree.contextMenu.sectionHistory')}</SectionLabel>
      <MenuItem icon={Combine} label={t('gitTree.contextMenu.squash')} disabled soonTitle={soon} />
      <MenuItem
        icon={Layers}
        label={t('gitTree.contextMenu.fixup')}
        onClick={run(onFixup)}
        disabled={!isSingle}
        soonTitle={t('gitTree.contextMenu.singleOnly')}
      />

      <Divider />

      {/* Rebase */}
      <SectionLabel>{t('gitTree.contextMenu.sectionRebase')}</SectionLabel>
      <MenuItem icon={Repeat} label={t('gitTree.contextMenu.interactiveRebase')} disabled soonTitle={soon} />
      <MenuItem icon={GitGraphIcon} label={t('gitTree.contextMenu.rebaseOnto')} disabled soonTitle={soon} />

      <Divider />

      {/* Déplacement */}
      <SectionLabel>{t('gitTree.contextMenu.sectionMove')}</SectionLabel>
      <MenuItem icon={Cherry} label={t('gitTree.contextMenu.cherryPick')} disabled soonTitle={soon} />
      <MenuItem icon={Trash2} label={t('gitTree.contextMenu.drop')} disabled danger soonTitle={soon} />

      <Divider />

      {/* Pointeurs */}
      <SectionLabel>{t('gitTree.contextMenu.sectionPointers')}</SectionLabel>
      <MenuItem icon={LogIn} label={t('gitTree.contextMenu.checkout')} disabled soonTitle={soon} />
      <MenuItem
        icon={SkipBack}
        label={t('gitTree.contextMenu.reset')}
        onClick={run(onReset)}
        disabled={!isSingle}
        soonTitle={t('gitTree.contextMenu.singleOnly')}
      />

      <Divider />

      {/* Divers */}
      <SectionLabel>{t('gitTree.contextMenu.sectionMisc')}</SectionLabel>
      <MenuItem
        icon={RotateCcw}
        label={t('gitTree.contextMenu.revert')}
        onClick={run(onRevert)}
        disabled={!isSingle}
        soonTitle={t('gitTree.contextMenu.singleOnly')}
      />
      <MenuItem icon={Copy} label={t('gitTree.contextMenu.copySha')} onClick={run(onCopySha)} />
      <MenuItem icon={Tag} label={t('gitTree.contextMenu.createTag')} disabled soonTitle={soon} />
      <MenuItem
        icon={GitBranchPlus}
        label={t('gitTree.contextMenu.createBranch')}
        onClick={run(onCreateBranch)}
        disabled={!isSingle}
        soonTitle={t('gitTree.contextMenu.singleOnly')}
      />
    </ContextMenuSurface>
  )
}
