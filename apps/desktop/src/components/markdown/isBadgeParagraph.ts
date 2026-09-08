/**
 * Structural subset of a hast node — enough to walk a paragraph's children without depending on
 * `@types/hast`, which react-markdown only pulls in transitively.
 */
export interface MarkdownNodeLike {
  type: string
  tagName?: string
  value?: string
  children?: MarkdownNodeLike[]
}

/** Elements that may sit inside a badge, or wrap one, without making the paragraph prose. */
const BADGE_WRAPPERS = new Set(['a', 'picture', 'span', 'em', 'strong'])
const BADGE_LEAVES = new Set(['img', 'source', 'br'])

function isWhitespaceText(node: MarkdownNodeLike): boolean {
  return node.type === 'text' && (node.value ?? '').trim() === ''
}

function isBadgeContent(node: MarkdownNodeLike): boolean {
  if (node.type === 'text') return isWhitespaceText(node)
  if (node.type !== 'element') return false
  const tag = node.tagName ?? ''
  if (BADGE_LEAVES.has(tag)) return true
  if (!BADGE_WRAPPERS.has(tag)) return false
  return (node.children ?? []).every(isBadgeContent)
}

function containsImage(node: MarkdownNodeLike): boolean {
  if (node.type === 'element' && node.tagName === 'img') return true
  return (node.children ?? []).some(containsImage)
}

/**
 * Whether a paragraph is a *badge row* — nothing but images (bare, or wrapped in a link/picture) and
 * whitespace, the shape a README's shields.io header or a bot's status strip has.
 *
 * Only such a paragraph gets `markdown.css`'s flex layout, and the distinction matters twice over.
 * A paragraph mixing prose with an image is laid out as flex too if the test is merely "contains an
 * `img`" (the `p:has(img)` selector this replaced): every text run and inline link then becomes its
 * own flex item, so a hard line break collapses — a flex item is a *row* item, not a line — and the
 * `gap` opens 6px holes around commas. Sonar's and Copilot's PR comments are exactly that shape:
 * a label, a hard break, then an icon and a link per line.
 */
export function isBadgeParagraph(node: MarkdownNodeLike | undefined): boolean {
  if (!node) return false
  const children = node.children ?? []
  if (!children.some(containsImage)) return false
  return children.every(isBadgeContent)
}
