import { defaultSchema } from 'rehype-sanitize'

/**
 * Allow-list applied to markdown *after* `rehype-raw` has expanded its embedded HTML.
 *
 * The renderer feeds on content nobody here controls: PR descriptions and review comments pulled
 * from GitHub, and READMEs of whatever repository the user cloned. `rehype-raw` alone would hand
 * that content the DOM — `<form action="https://…">` in particular survives the app's CSP, which
 * has no `form-action` directive. `hast-util-sanitize`'s default schema is GitHub's own allow-list,
 * so it already keeps everything a README legitimately uses (`<details>`, `<picture>`,
 * `<div align="center">` banners, `<img width>`, `<kbd>`, task-list checkboxes, and the legacy
 * `align` attribute GFM tables carry their column alignment in) while dropping scripts, iframes,
 * forms, event handlers, `style` attributes and `javascript:` URLs.
 *
 * It's used as-is: no widening has proven necessary so far, and every entry added here is one more
 * thing a stranger's pull request gets to put on screen. `rehype-highlight` must run *after* the
 * sanitizer — its `hljs-*` class names are ours, not the document's, and the schema only whitelists
 * `language-*` on `code`.
 */
export const markdownSanitizeSchema = defaultSchema

/**
 * The same allow-list, plus `<video>`, for markdown the **user wrote themselves** — today only board
 * cards and their comments.
 *
 * Kept as a separate schema rather than widening the one above, because that one also renders
 * READMEs and pull requests from strangers, and `<video>` there would let an untrusted document
 * autoplay media and make outbound requests. The distinction is provenance, not content: a board
 * card is authored in this app, by this user, and stored in their own repository.
 *
 * `src` protocols are left at the default `http`/`https`. A local attachment reaches the renderer as
 * a *relative* path (`.git-manager/attachments/…`), which carries no protocol for the sanitizer to
 * reject, and is turned into an `asset://` URL afterwards by `MarkdownImage`/`MarkdownVideo` — after
 * sanitizing, so no protocol needs whitelisting here.
 */
export const authoredMarkdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'video', 'source'],
  attributes: {
    ...defaultSchema.attributes,
    video: ['src', 'controls', 'width', 'height', 'poster', 'loop', 'muted', 'playsInline'],
    source: ['src', 'type'],
  },
}
