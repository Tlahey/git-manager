// Processes @tailwind directives in globals.css for the Storybook preview so the
// real components render with their utility classes. Vite (via @storybook/react-vite)
// auto-loads this at the package root. Unit tests import no stylesheets, so it's a
// no-op there.
export default {
  plugins: {
    tailwindcss: {},
  },
}
