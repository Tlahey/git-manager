// @git-manager/storybook-a11y — a reusable accessibility harness for the repo's
// Storybooks. Token-level contrast grading (WCAG + APCA + non-text) stays in
// @git-manager/theme; this is its rendered counterpart — what axe sees on the real
// pixels, font-size/weight aware.
//
// Four entries with strict loading constraints:
//   .                      (this file)  PREVIEW-SAFE: shared theme/surface decorator +
//                                       toolbar + surface constants — no axe, no vitest.
//   ./preview-apca                      PREVIEW-SAFE: registers APCA Bronze into the
//                                       addon-a11y Accessibility panel (axe, no vitest).
//   ./testing                           TEST-SIDE: axe + APCA runner + the theme ×
//                                       surface matrix — imports vitest, must NEVER be
//                                       pulled into the Storybook browser runtime
//                                       (importing vitest there crashes the preview).
//   ./vitest-apca-reporter              NODE-SIDE: custom Vitest reporter writing the
//                                       apca-report artifacts — uses node:fs, vitest
//                                       configs only.
export { globalTypes, withThemeSurface } from './decorator'
export { SURFACES, DEFAULT_THEMES, DEFAULT_SURFACES, type SurfaceId } from './constants'
