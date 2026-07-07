import baseConfig from '@git-manager/config/tailwind'

// Only used by the Storybook build — consumers (the desktop app) run their own tailwind pass
// over this package's sources via their content globs.
/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: [
    './src/**/*.{ts,tsx}',
    './stories/**/*.{ts,tsx}',
    '../ui/src/**/*.{ts,tsx}',
  ],
}
