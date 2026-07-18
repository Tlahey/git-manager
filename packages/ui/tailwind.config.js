import baseConfig from '@git-manager/config/tailwind'

/**
 * Storybook-only Tailwind config for the component showcase. Scans the component
 * sources + stories so the shared color groups (button, sidebar, success, …) and
 * utilities render exactly as the app ships them, resolved against whichever theme
 * the Storybook toolbar selects.
 * @type {import('tailwindcss').Config}
 */
export default {
  ...baseConfig,
  content: ['./src/**/*.{ts,tsx}', './stories/**/*.{ts,tsx}', './.storybook/**/*.{ts,tsx}'],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme?.extend,
    },
  },
}
