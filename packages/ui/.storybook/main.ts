import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The repo is 100% local/no-telemetry by principle (see CLAUDE.md).
  core: {
    disableTelemetry: true,
  },
  // Force a single React instance. pnpm's nested node_modules can otherwise let the
  // preview pull a second react copy, which Vite pre-bundles without a synthesized
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
      // Imported by the preview (enableApcaInA11yAddon): pre-bundle so the dev server
      // doesn't re-optimize mid-session, and so the preview and addon-a11y share one
      // axe-core module instance (the APCA reset-patch relies on that).
      'axe-core',
      '@git-manager/storybook-a11y > apca-check',
    ]
    return viteConfig
  },
}

export default config
