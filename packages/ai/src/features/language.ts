/**
 * The one place a UI language tag becomes a word a model understands.
 *
 * Every prose-producing feature needs it — the explanations, the daily summary, the code review —
 * and each one had grown its own identical copy. A sixth would have been the point at which adding a
 * locale meant finding six switches, so it lives here instead.
 *
 * Deliberately falls back to English rather than passing an unknown tag through: `Write the entire
 * review in pt-BR` is a sentence a model will happily obey with wildly varying quality, while the
 * app only ships `en`, `fr` and `es`. An unsupported tag is a bug in the caller, not something to
 * improvise on.
 */
export function languageName(tag: string | undefined): string {
  switch (tag) {
    case 'fr':
      return 'French'
    case 'es':
      return 'Spanish'
    default:
      return 'English'
  }
}
