import { splitPath } from '../../lib/filePath'

interface FilePathLabelProps {
  /** Repo-relative path. */
  path: string
}

/**
 * A file path shown as a dimmed directory followed by an emphasised name.
 *
 * The directory is the part that truncates: when the row is too narrow, what a reader needs is the
 * file's name, and the folders leading to it are what they can afford to lose. That is the whole
 * point of splitting the two into separate spans rather than truncating the path as one string,
 * which would cut the name off instead.
 *
 * At the repository root there is no directory, and the name takes the width on its own.
 */
export function FilePathLabel({ path }: FilePathLabelProps) {
  const { dir, name } = splitPath(path)

  if (!dir) {
    return <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{path}</span>
  }

  return (
    <>
      <span className="min-w-0 shrink truncate pr-0.5 text-muted-foreground/45">{dir}</span>
      <span className="shrink-0 font-semibold text-foreground">{name}</span>
    </>
  )
}
