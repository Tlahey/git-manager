/**
 * Openers for the graph's detached editor windows (interactive rebase, …). Extracted so several
 * call sites (the ref drag-drop menu, the tag context menu) share one implementation instead of
 * each re-deriving the `WebviewWindow` boilerplate.
 */

/** Opens the interactive-rebase editor window for `baseOid` (same pattern as the fixup window). */
export async function openRebaseWindow(repoPath: string, baseOid: string): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const safeLabel = `rebase-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const url =
    `/?window=rebase&repoPath=${encodeURIComponent(repoPath)}` +
    `&baseOid=${encodeURIComponent(baseOid)}`

  const existing = await WebviewWindow.getByLabel(safeLabel)
  if (existing) {
    await existing.show()
    await existing.setFocus()
  } else {
    new WebviewWindow(safeLabel, {
      url,
      title: 'Interactive Rebase',
      width: 1200,
      height: 850,
      minWidth: 900,
      minHeight: 600,
      decorations: true,
    })
  }
}
