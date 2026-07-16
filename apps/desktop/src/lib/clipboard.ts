import { toast } from '@git-manager/ui'

/** Copies `value` to the clipboard and confirms with a toast (or reports failure). */
export function copyWithToast(value: string, what: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${what} copied to clipboard`, { description: value }),
    () => toast.error(`Failed to copy ${what}`)
  )
}
