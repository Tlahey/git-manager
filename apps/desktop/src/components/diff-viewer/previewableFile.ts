/**
 * Which files the diff viewer can offer a rendered "Preview" tab for, next to the raw diff and the
 * file's contents.
 *
 * Extension sniffing is deliberate: the preview is a convenience, and getting it wrong costs a tab
 * nobody asked for, not a wrong diff. Note that being previewable says nothing about being binary —
 * an SVG renders as an image *and* diffs as text, so both its Preview and its Diff tabs are useful.
 */

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i
const MARKDOWN_EXTENSIONS = /\.(md|markdown|mdown|mkdn|mdwn)$/i

export function isPreviewableImage(path: string | undefined | null): boolean {
  return Boolean(path && IMAGE_EXTENSIONS.test(path))
}

export function isPreviewableMarkdown(path: string | undefined | null): boolean {
  return Boolean(path && MARKDOWN_EXTENSIONS.test(path))
}

export function hasPreviewTab(path: string | undefined | null): boolean {
  return isPreviewableImage(path) || isPreviewableMarkdown(path)
}
