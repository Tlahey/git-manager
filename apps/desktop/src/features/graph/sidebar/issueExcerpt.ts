/** Longest excerpt the hover card shows before trailing off into an ellipsis. */
export const EXCERPT_LENGTH = 260

/**
 * A short plain-text opening of an issue's markdown body, for the hover preview.
 *
 * Deliberately *not* the rendered markdown the issue view shows: a preview has to fit a fixed card
 * whatever the issue contains, and a body that opens on a table, a screenshot or a stack trace in a
 * fenced block would either blow the card's height apart or render as a scrap of a widget. So the
 * structural pieces are dropped rather than truncated (a cut fence renders as garbage), links keep
 * their text, and what is left is the prose — which is what tells you whether this is the issue you
 * were looking for.
 */
export function issueExcerpt(body: string | undefined, maxLength = EXCERPT_LENGTH): string {
  if (!body) return ''

  const text = body
    // Fenced code blocks, whole. An unterminated fence (a body cut mid-block) takes the rest with
    // it, which is the safe reading — there is no prose to recover after an open fence.
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, ' ')
    // HTML comments — issue templates hide their instructions in these.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Images before links, since an image is a link with a leading `!`.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Raw HTML tags (issue templates and pasted content are full of <details>/<img>/<br>).
    .replace(/<[^>]+>/g, ' ')
    // Leading block markers: headings, quotes, list bullets, table pipes, horizontal rules.
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ')
    .replace(/^[ \t]*\|.*$/gm, ' ')
    // Inline emphasis / code markers, kept as their content.
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= maxLength) return text
  // Cut on a word boundary when there is one close enough, so the excerpt doesn't end mid-word.
  const clipped = text.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}
