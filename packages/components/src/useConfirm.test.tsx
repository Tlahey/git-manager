import { describe, it, expect } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConfirm } from './useConfirm'

const OPTIONS = {
  title: 'Discard changes?',
  description: 'This cannot be undone.',
  confirmLabel: 'Discard',
  cancelLabel: 'Keep',
  destructive: true,
}

/** Mirrors the shape of a real call site: `if (!(await confirm(…))) return`. */
function Harness({
  onAnswer,
  askRef,
}: {
  onAnswer: (answer: boolean) => void
  /** Lets a test ask again while the dialog is open — the modal overlay blocks a second click. */
  askRef?: { current: (() => void) | null }
}) {
  const { confirm, confirmDialog } = useConfirm()
  const ask = () => void confirm(OPTIONS).then(onAnswer)
  if (askRef) askRef.current = ask
  return (
    <>
      <button type="button" onClick={ask}>
        Ask
      </button>
      {confirmDialog}
    </>
  )
}

describe('useConfirm', () => {
  it('renders nothing until asked', () => {
    render(<Harness onAnswer={() => {}} />)
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })

  it('shows the title and description, and resolves true on confirm', async () => {
    const answers: boolean[] = []
    render(<Harness onAnswer={(a) => answers.push(a)} />)
    await userEvent.click(screen.getByText('Ask'))

    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(answers).toEqual([true]))
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })

  it('resolves false on cancel, so a dismissed prompt reads as "do nothing"', async () => {
    const answers: boolean[] = []
    render(<Harness onAnswer={(a) => answers.push(a)} />)
    await userEvent.click(screen.getByText('Ask'))
    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    await waitFor(() => expect(answers).toEqual([false]))
  })

  it('resolves false on Escape rather than leaving the promise pending', async () => {
    const answers: boolean[] = []
    render(<Harness onAnswer={(a) => answers.push(a)} />)
    await userEvent.click(screen.getByText('Ask'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(answers).toEqual([false]))
  })

  it('answers a superseded request false instead of stranding its promise', async () => {
    const answers: boolean[] = []
    const askRef: { current: (() => void) | null } = { current: null }
    render(<Harness onAnswer={(a) => answers.push(a)} askRef={askRef} />)
    await userEvent.click(screen.getByText('Ask'))

    // Not a second click: the open modal makes the background inert, so a re-entrant ask can only
    // come from code (a timer, an event handler) — which is exactly the case the guard exists for.
    act(() => askRef.current?.())
    await waitFor(() => expect(answers).toEqual([false]))

    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(answers).toEqual([false, true]))
  })
})
