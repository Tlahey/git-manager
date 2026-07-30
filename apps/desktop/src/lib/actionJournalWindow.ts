/**
 * Opener for the "Behind the scenes" window (`window=actions`), which explains the git commands
 * behind the actions the user performed.
 *
 * Same shape as `graphWindows.ts`: a fixed label so a second click focuses the window that is already
 * open rather than stacking another. The label is a constant, not derived from a repository, because
 * the journal is app-wide — it shows every action across every open repo, which is what makes "what
 * did I just do" answerable when the answer spans two of them.
 */

const WINDOW_LABEL = 'action-journal'

export async function openActionJournalWindow(): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return
  }

  new WebviewWindow(WINDOW_LABEL, {
    url: '/?window=actions',
    title: 'Behind the Scenes',
    width: 1080,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    decorations: true,
  })
}
