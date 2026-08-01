import { ArrowUpFromLine, ChevronDown, ShieldOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@git-manager/ui'
import { ToolbarButton } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'

interface PushButtonProps {
  loading?: boolean
  disabled?: boolean
  /** Commits waiting to be pushed, shown as a badge. `0` hides it. */
  aheadCount?: number
  onPush: () => void
  onPushSkippingHooks: () => void
}

/**
 * `Push`, with a dropdown for the one alternate form it has: pushing without running `pre-push`.
 *
 * Built on `ToolbarButton`'s trailing slot rather than hand-rolled next to it, so the badge, the
 * label fold and the disabled styling stay the toolbar's and not this file's.
 *
 * The escape hatch sits *behind the caret* rather than being a control of its own, and that is the
 * point: a `pre-push` hook is somebody's quality gate, this app spent a release making sure it
 * actually runs, and skipping it should cost a deliberate extra click. It exists for the hook that
 * hangs or misfires — not as a way to make committing quieter.
 */
export function PushButton({
  loading,
  disabled,
  aheadCount = 0,
  onPush,
  onPushSkippingHooks,
}: PushButtonProps) {
  const { t } = useTranslation('git')

  return (
    <ToolbarButton
      icon={<ArrowUpFromLine className="h-4 w-4 text-green-400" />}
      label={t('remote.push')}
      title={aheadCount > 0 ? t('remote.commitsToPush', { count: aheadCount }) : t('remote.push')}
      loading={loading}
      disabled={disabled}
      badge={aheadCount}
      onClick={onPush}
      data-testid="toolbar-push-button"
      trailing={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled || loading}
              aria-label={t('remote.pushOptions')}
              data-testid="toolbar-push-menu-button"
              className="flex cursor-pointer items-center rounded-r px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem
              onSelect={onPushSkippingHooks}
              data-testid="toolbar-push-skip-hooks"
              className="gap-2 text-xs"
            >
              <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
              {t('remote.pushSkipHooks')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  )
}
