import 'vitest'
import { type TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// `@testing-library/jest-dom/vitest` (loaded in vitest.setup.ts) augments vitest's `Assertion`
// too, but that augmentation is anchored to whatever `vitest` package jest-dom's own on-disk
// location resolves — a different, older instance hoisted elsewhere in the pnpm workspace, not
// this package's own `vitest` dependency. Re-declaring the augmentation here, in a file that
// resolves `vitest` the same way this package's test files do, closes that gap.
declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
