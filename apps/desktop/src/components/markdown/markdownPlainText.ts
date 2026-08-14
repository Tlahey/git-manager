/**
 * Markdown reduced to the prose inside it, for the places that show a **preview** of a document
 * rather than the document: a board card's face, an issue hover card.
 *
 * Deliberately *not* the rendered markdown those documents get elsewhere. A preview has to fit a
 * fixed box whatever the body contains, and one that opens on a table, a screenshot or a stack
 * trace in a fenced block would either blow the box apart or render as a scrap of a widget. So the
 * structural pieces are dropped rather than truncated (a cut fence renders as garbage), links keep
 * their text, and what is left is the prose — which is what tells you whether this is the card or
 * the issue you were looking for.
 *
 * For a single line whose markers should be *honoured* rather than removed — a title — see
 * `parseInlineMarkdown.ts` instead.
 */
export function markdownToPlainText(source: string | undefined): string {
  if (!source) return ''

  return (
    source
      // Fenced code blocks, whole. An unterminated fence (a body cut mid-block) takes the rest with
      // it, which is the safe reading — there is no prose to recover after an open fence.
      .replace(/```[\s\S]*?(?:```|$)/g, ' ')
      .replace(/~~~[\s\S]*?(?:~~~|$)/g, ' ')
      // HTML comments — issue templates hide their instructions in these, and a board card hides its
      // own `<!-- git-manager:meta … -->` marker in one.
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Images before links, since an image is a link with a leading `!`.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Raw HTML tags (issue templates and pasted content are full of <details>/<img>/<br>).
      .replace(/<[^>]+>/g, ' ')
      // Task-list markers, before the bullet they sit behind.
      .replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, '')
      // Leading block markers: headings, quotes, list bullets, table pipes, horizontal rules.
      .replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, '')
      .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ')
      .replace(/^[ \t]*\|.*$/gm, ' ')
      // Inline emphasis / code markers, kept as their content.
      .replace(/[*_~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
