import { useTranslation } from '@git-manager/i18n'
import { useStashDialogStore } from '../../stores/stashDialog.store'
import { useBranchCheckout } from '../../hooks/useBranchCheckout'
import { StashConfirmDialog } from '../shared/StashConfirmDialog'

/**
 * Confirmation shown when a branch switch was refused because of uncommitted changes: stashes
 * everything and retries the checkout. Opened from the store by `useBranchCheckout`, so every
 * checkout entry point (toolbar, sidebar menu, graph menu, ref drag & drop) shares this one dialog
 * — mount it once per repo view, next to its bisect counterpart (BisectStashDialog).
 */
export function CheckoutStashConfirm() {
  const { t } = useTranslation('git')
  const isOpen = useStashDialogStore((s) => s.isOpen && s.reason === 'checkout')
  const repoPath = useStashDialogStore((s) => s.repoPath)
  const targetRef = useStashDialogStore((s) => s.targetRef)
  const checkoutOpts = useStashDialogStore((s) => s.checkoutOpts)
  const closeDialog = useStashDialogStore((s) => s.closeDialog)
  const { stashAndCheckout, pending } = useBranchCheckout()

  if (!isOpen || !repoPath || !targetRef) return null

  return (
    <StashConfirmDialog
      open={isOpen}
      onOpenChange={(next) => !next && closeDialog()}
      title={t('checkout.conflict.dialogTitle')}
      description={t('checkout.conflict.dialogDescription', { branch: targetRef })}
      cancelLabel={t('checkout.conflict.dialogCancel')}
      confirmLabel={t('checkout.conflict.dialogConfirm')}
      onCancel={closeDialog}
      onConfirm={() => void stashAndCheckout(repoPath, targetRef, checkoutOpts ?? undefined)}
      pending={pending}
      testId="checkout-stash-dialog"
      confirmTestId="checkout-stash-confirm-button"
    />
  )
}
