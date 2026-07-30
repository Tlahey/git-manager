import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@git-manager/ui'
import { useE2eFolderPickerStore } from '../stores/e2eFolderPicker.store'

/**
 * Debug stand-in for the native OS folder picker, only ever mounted when `VITE_E2E === 'true'`
 * (see `pickFolder.ts`). Plain text input rather than a real filesystem browser: a test always
 * knows the exact path it wants (a fixture it just built), so there is nothing to browse for.
 */
export function E2eFolderPickerDialog() {
  const open = useE2eFolderPickerStore((s) => s.open)
  const value = useE2eFolderPickerStore((s) => s.value)
  const setValue = useE2eFolderPickerStore((s) => s.setValue)
  const confirm = useE2eFolderPickerStore((s) => s.confirm)
  const cancel = useE2eFolderPickerStore((s) => s.cancel)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && cancel()}>
      <DialogContent className="max-w-md" data-testid="e2e-folder-picker-dialog">
        <DialogHeader>
          <DialogTitle>E2E debug folder picker</DialogTitle>
          <DialogDescription>
            Stands in for the native OS folder picker, which WebDriver cannot drive. Type the
            absolute path a test wants opened, cloned into, or initialized.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          data-testid="e2e-folder-picker-input"
          placeholder="/tmp/git-manager-fixtures/..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        <DialogFooter>
          <Button variant="ghost" data-testid="e2e-folder-picker-cancel" onClick={cancel}>
            Cancel
          </Button>
          <Button data-testid="e2e-folder-picker-confirm" onClick={confirm} disabled={!value.trim()}>
            Choose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
