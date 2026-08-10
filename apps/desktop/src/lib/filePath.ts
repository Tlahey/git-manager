/**
 * Splitting a repo-relative path into its directory and its file name.
 *
 * Five copies of this lived across the app — in the batch-commit group, the conflict diff header,
 * the commit file list, the diff viewer's header and the palette's file lookup — and they did not
 * agree: four kept the trailing slash on `dir` because they render it straight before the name, the
 * fifth dropped it because it renders the two apart. That disagreement is the reason this module
 * exposes both forms under names that say which is which, rather than one function with a flag.
 *
 * Repo-relative paths only, so `/` is the separator whatever the platform — these come from git,
 * not from the filesystem.
 */

/** Everything after the last slash. The whole path when there is none. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Everything before the last slash, *without* it. Empty at the root. */
export function dirName(path: string): string {
  const lastSlash = path.lastIndexOf('/')
  return lastSlash === -1 ? '' : path.slice(0, lastSlash)
}

/**
 * `{ dir, name }` with `dir` **keeping its trailing slash**, so the two concatenate back into the
 * original path — which is exactly what the callers that render them side by side rely on. `dir` is
 * empty at the root.
 */
export function splitPath(path: string): { dir: string; name: string } {
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash === -1) return { dir: '', name: path }
  return { dir: path.slice(0, lastSlash + 1), name: path.slice(lastSlash + 1) }
}
