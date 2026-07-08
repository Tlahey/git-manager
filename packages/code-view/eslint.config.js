import sharedConfig from '@git-manager/config/eslint'

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  ...sharedConfig,
  {
    // Declaration merging into vitest's `Assertion`/`AsymmetricMatchersContaining` requires
    // redeclaring them as empty interfaces extending the matcher types, with the same `any`
    // generic defaults `@testing-library/jest-dom`'s own upstream augmentation uses — there's
    // no other shape for this mechanism.
    files: ['src/vitest-jest-dom.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
]
