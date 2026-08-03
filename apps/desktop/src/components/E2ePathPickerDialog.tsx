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
import { useE2ePathPickerStore } from '../stores/e2ePathPicker.store'

/**
 * Debug stand-in for whichever native OS dialog (folder picker, file picker, save-as) is being
 * called, only ever mounted when `VITE_E2E === 'true'` (see `pickFolder.ts`/`pickFile.ts`/
 * `pickSaveDestination.ts`). Plain text input rather than a real filesystem browser: a test always
 * knows the exact path it wants (a fixture it just built), so there is nothing to browse for. Test
 * ids kept as `e2e-folder-picker-*` even though this dialog now serves more than folders — renaming
 * them would break every already-written step that drives it.
 */
export function E2ePathPickerDialog() {
  const open = useE2ePathPickerStore((s) => s.open)
  const value = useE2ePathPickerStore((s) => s.value)
  const setValue = useE2ePathPickerStore((s) => s.setValue)
  const confirm = useE2ePathPickerStore((s) => s.confirm)
  const cancel = useE2ePathPickerStore((s) => s.cancel)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && cancel()}>
      <DialogContent className="max-w-md" data-testid="e2e-folder-picker-dialog">
        <DialogHeader>
          <DialogTitle>E2E debug path picker</DialogTitle>
          <DialogDescription>
            Stands in for a native OS dialog (folder picker, file picker, or save-as), which
            WebDriver cannot drive. Type the absolute path a test wants.
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
          <Button
            data-testid="e2e-folder-picker-confirm"
            onClick={confirm}
            disabled={!value.trim()}
          >
            Choose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
