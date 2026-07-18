// Test-side harness (Vitest browser mode): axe + APCA Bronze config and the theme ×
// surface matrix runner. `matrix` imports from 'vitest', so this entry must NOT be
// pulled into the Storybook preview — it's kept separate from the package root ("."),
// which stays preview-safe. Import from "@git-manager/storybook-a11y/testing" in
// *.test.tsx files only.
export { runAxe, DEFAULT_DISABLED_RULES } from './axe'
export { runA11yMatrix, type A11yMatrixOptions } from './matrix'
