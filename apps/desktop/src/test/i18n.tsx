import { render, type RenderOptions } from '@testing-library/react'
import { act, type ReactElement } from 'react'
import { i18next, type SupportedLanguage } from '@git-manager/i18n'

/**
 * Render a component with i18n forced to a specific language for the duration of the test.
 *
 * The global test setup (`vitest.setup.ts`) initializes i18n in **English** so ordinary tests
 * assert real, source-locale copy. Use this helper only for the special cases that must validate
 * another locale (e.g. French pluralization, locale-specific formatting). The language is reset
 * back to English automatically in the global `afterEach`.
 *
 * ```tsx
 * renderWithLanguage(<Toolbar … />, 'fr')
 * expect(screen.getByText('Rechercher…')).toBeInTheDocument()
 * ```
 */
export function renderWithLanguage(
  ui: ReactElement,
  language: SupportedLanguage,
  options?: RenderOptions
) {
  // `resources` are inline, so changeLanguage applies synchronously; wrap in act() so any
  // i18n-driven re-render is flushed before the caller queries the DOM.
  act(() => {
    void i18next.changeLanguage(language)
  })
  return render(ui, options)
}
