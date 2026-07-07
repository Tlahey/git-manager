import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The repo is 100% local/no-telemetry by principle (see CLAUDE.md) — storybook included.
  core: {
    disableTelemetry: true,
  },
}

export default config
