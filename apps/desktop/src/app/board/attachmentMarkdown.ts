/**
 * Turns a saved attachment into the markdown that embeds it in a card.
 *
 * The URL differs per backend, and the difference is not cosmetic. A **local** card is only ever
 * read inside this app, so a repo-relative path is right: `MarkdownImage`/`MarkdownVideo` resolve it
 * against the repository at render time, and nothing breaks if the repo is moved or re-cloned. A
 * **remote** card is a GitHub issue, and GitHub does *not* resolve relative image paths in issue
 * bodies (only in READMEs) — a relative path there would render in the app and appear broken on
 * github.com, so those get an absolute `raw.githubusercontent.com` URL instead. That URL only
 * resolves once the file has been committed and pushed, which the UI says out loud.
 */

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv']

export type AttachmentKind = 'image' | 'video' | 'file'

export function attachmentKind(fileName: string): AttachmentKind {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video'
  return 'file'
}

/** `https://raw.githubusercontent.com/<owner>/<repo>/<branch>` — the prefix a remote board's
 * attachments are addressed through. */
export function rawContentUrlPrefix(owner: string, repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`
}

export function attachmentUrl(relativePath: string, urlPrefix?: string): string {
  if (!urlPrefix) return relativePath
  return `${urlPrefix.replace(/\/+$/, '')}/${relativePath.replace(/^\.?\//, '')}`
}

/**
 * The snippet inserted into the card body. Videos use raw `<video>` rather than markdown, which has
 * no video syntax — it survives the authored-content sanitizer and is what GitHub itself accepts in
 * an issue body.
 */
export function attachmentMarkdown(
  relativePath: string,
  fileName: string,
  urlPrefix?: string
): string {
  const url = attachmentUrl(relativePath, urlPrefix)
  const label = fileName.replace(/\.[^.]+$/, '') || 'attachment'

  switch (attachmentKind(fileName)) {
    case 'image':
      return `![${label}](${url})`
    case 'video':
      return `<video src="${url}" controls></video>`
    default:
      return `[${fileName}](${url})`
  }
}

/** Inserts `snippet` at the caret, keeping it on its own line and returning where the caret should
 * land afterwards. */
export function insertAtCaret(
  value: string,
  snippet: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; caret: number } {
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)
  const prefix = before && !before.endsWith('\n') ? '\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n' : ''
  const inserted = `${prefix}${snippet}${suffix}`
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length }
}
