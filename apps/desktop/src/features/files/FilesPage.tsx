import { useEffect, useMemo } from 'react'
import { FileIcon, FolderIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Button, cn } from '@git-manager/ui'
import { useFileExplorerStore } from './stores/fileExplorer.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoFiles } from './hooks/useRepoFiles'
import { useGitStatus } from '../../hooks/useGitStatus'
import { buildFileTree, findDirectoryNodes } from './lib/fileTree'
import { DiffViewCenter } from '../../components/diff-viewer/DiffViewCenter'
import { isPreviewableImage } from '../../components/diff-viewer/previewableFile'
import { TerminalPanel } from '../../components/terminal/TerminalPanel'
import { TerminalStatusBar } from '../../components/terminal/TerminalStatusBar'
import { useTerminalStore } from '../../stores/terminal.store'

/**
 * The project files view: a breadcrumb, the directory listing under it, and the diff/blame viewer a
 * selected file opens into.
 *
 * The chrome that used to sit in its own header — closing the view, revealing the tree, filtering it
 * — is gone from here: closing is switching tab now, and the other two belong to the toolbar, which
 * is scoped to this view (see `FilesToolbar`). What is left is the view itself.
 */
export function FilesPage() {
  const { t } = useTranslation('git')
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo

  const { data: files } = useRepoFiles(effectiveRepoPath)
  const { data: gitStatus } = useGitStatus(effectiveRepoPath ?? '')

  const selectedFilePath = useFileExplorerStore((s) => s.selectedFilePath)
  const currentDirPath = useFileExplorerStore((s) => s.currentDirPath)
  const setCurrentDirPath = useFileExplorerStore((s) => s.actions.setCurrentDirPath)
  const setSelectedFilePath = useFileExplorerStore((s) => s.actions.setSelectedFilePath)
  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)
  const terminalOpen = useTerminalStore((s) => s.open)

  useEffect(() => {
    // `DiffViewCenter` publishes the file it shows into the global store (that's how the Blame and
    // History panels know what they're looking at). With no file selected there's nothing to
    // publish, and on unmount the graph must not inherit ours.
    if (!selectedFilePath) {
      setActiveDiffFile(null)
    }
    return () => {
      setActiveDiffFile(null)
    }
  }, [selectedFilePath, setActiveDiffFile])

  const fileState = useMemo(() => {
    if (!selectedFilePath || !gitStatus) return { staged: false, unmodified: false }
    const isStaged = gitStatus.staged.some((f) => f.path === selectedFilePath)
    const isUnstaged = gitStatus.unstaged.some((f) => f.path === selectedFilePath)
    // A file staged *and* modified again shows its working-tree changes; `unmodified` drives the
    // viewer's fallback to the file's last committed version.
    return { staged: isStaged && !isUnstaged, unmodified: !isStaged && !isUnstaged }
  }, [selectedFilePath, gitStatus])

  const tree = useMemo(() => buildFileTree(files ?? []), [files])
  const currentNodes = useMemo(() => findDirectoryNodes(tree, currentDirPath), [tree, currentDirPath])

  const breadcrumbs = currentDirPath ? currentDirPath.split('/') : []
  const repoName = effectiveRepoPath?.split('/').pop() ?? ''

  return (
    <div
      className="flex h-full flex-1 flex-col overflow-hidden bg-background"
      data-testid="project-files-view"
    >
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-border px-4 text-sm">
        <Button
          variant="link"
          className="h-auto p-0 text-sm font-medium"
          onClick={() => setCurrentDirPath('')}
          data-testid="file-breadcrumb-root"
        >
          {repoName}
        </Button>

        {breadcrumbs.map((part, i) => {
          const isLast = i === breadcrumbs.length - 1 && !selectedFilePath
          return (
            <span key={`${part}-${i}`} className="flex items-center">
              <ChevronRightIcon size={16} className="mx-1 text-muted-foreground" />
              <Button
                variant="link"
                className={cn(
                  'h-auto p-0 text-sm',
                  isLast && 'font-semibold text-foreground no-underline hover:no-underline'
                )}
                aria-current={isLast ? 'page' : undefined}
                onClick={() => setCurrentDirPath(breadcrumbs.slice(0, i + 1).join('/'))}
                data-testid={`file-breadcrumb-${i}`}
              >
                {part}
              </Button>
            </span>
          )
        })}

        {selectedFilePath && (
          <span className="flex items-center">
            <ChevronRightIcon size={16} className="mx-1 text-muted-foreground" />
            <span className="font-semibold text-foreground" aria-current="page">
              {selectedFilePath.split('/').pop()}
            </span>
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedFilePath && effectiveRepoPath ? (
          <DiffViewCenter
            repoPath={effectiveRepoPath}
            file={{
              path: selectedFilePath,
              staged: fileState.staged,
              // An image has no readable diff or blame, so it opens straight on its preview;
              // everything else opens on the file's contents.
              initialTab: isPreviewableImage(selectedFilePath) ? 'preview' : 'file',
              unmodified: fileState.unmodified,
            }}
            onClose={() => setSelectedFilePath(null)}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="sticky top-0 border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2 font-medium text-muted-foreground">
                    {t('fileExplorer.columnName')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentNodes.map((node) => (
                  <tr
                    key={node.path}
                    className="border-b border-border/50 transition-colors hover:bg-accent/50"
                  >
                    <td className="p-0">
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={() =>
                          node.isDir ? setCurrentDirPath(node.path) : setSelectedFilePath(node.path)
                        }
                        data-testid={`file-row-${node.path}`}
                      >
                        {node.isDir ? (
                          <FolderIcon size={16} className="shrink-0 text-primary" />
                        ) : (
                          <FileIcon size={16} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className={node.isDir ? 'font-medium text-primary' : ''}>
                          {node.name}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
                {currentNodes.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-muted-foreground"
                      data-testid="file-explorer-empty-dir"
                    >
                      {t('fileExplorer.emptyDirectory')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {effectiveRepoPath &&
        (terminalOpen ? (
          <TerminalPanel path={effectiveRepoPath} />
        ) : (
          <TerminalStatusBar path={effectiveRepoPath} />
        ))}
    </div>
  )
}
