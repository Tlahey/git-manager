import { useEffect } from 'react'

/**
 * Opens (or refocuses) the dedicated merge-resolution window for `conflictFilePath`, and clears
 * it once done. Extracted from GitGraph.tsx (2026-08 retrofit, see architecture-guardian skill's
 * R3) — a self-contained effect with no dependency on any other graph state.
 */
export function useConflictMergeWindow(
  repoPath: string,
  conflictFilePath: string | null,
  setConflictFilePath: (path: string | null) => void
) {
  useEffect(() => {
    if (!conflictFilePath) return

    const openMergeWindow = async () => {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const safeLabel = `merge-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}-${conflictFilePath.replace(/[^a-zA-Z0-9_-]/g, '-')}`
      const url = `/?window=merge&repoPath=${encodeURIComponent(repoPath)}&filePath=${encodeURIComponent(conflictFilePath)}`

      const existing = await WebviewWindow.getByLabel(safeLabel)
      if (existing) {
        await existing.show()
        await existing.setFocus()
      } else {
        new WebviewWindow(safeLabel, {
          url,
          title: `Merge Revision for ${conflictFilePath}`,
          width: 1200,
          height: 800,
          minWidth: 900,
          minHeight: 600,
          decorations: true,
        })
      }
      setConflictFilePath(null)
    }

    openMergeWindow()
  }, [conflictFilePath, repoPath, setConflictFilePath])
}
