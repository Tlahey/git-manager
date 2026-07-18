import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The repo is 100% local/no-telemetry by principle (see CLAUDE.md) — storybook included.
  core: {
    disableTelemetry: true,
  },
  // Force a single React instance. pnpm's nested node_modules can otherwise let
  // the preview pull a second react copy, which Vite pre-bundles without a synth
  // default export → "react/index.js does not provide an export named 'default'".
  viteFinal: async (viteConfig) => {
    viteConfig.resolve ??= {}
    viteConfig.resolve.dedupe = [...(viteConfig.resolve.dedupe ?? []), 'react', 'react-dom']
    viteConfig.optimizeDeps ??= {}
    viteConfig.optimizeDeps.include = [
      ...(viteConfig.optimizeDeps.include ?? []),
      'react',
      'react-dom',
      'react/jsx-runtime',
    ]
    return viteConfig
  },
}

export default config
