/**
 * Prettier is a gate, not a suggestion: `pnpm format:check` runs before the tests and again in
 * `.husky/pre-push`, so this config has to produce the *same* output on every machine and in
 * every invocation. That is why it is a `.mjs` file rather than the `.prettierrc.json` it used
 * to be — the `tailwindStylesheet` line below needs the explanation that a JSON file can't hold.
 */
export default {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],

  /**
   * Tailwind v4 dropped the config file the plugin used to auto-detect, so it now needs to be
   * pointed at the CSS entry point that `@import 'tailwindcss'`. Without this line the plugin
   * resolves it (or fails to) inconsistently across a run: the first bulk `--write` left ~240
   * files' class lists untouched and the `--check` immediately after demanded them sorted, which
   * for a gate means CI failing on files nobody edited. Set explicitly, class ordering is
   * deterministic.
   *
   * `packages/ui/src/globals.css` is the right entry rather than the desktop app's own
   * `src/index.css`: it is the single stylesheet the app *and* every package's Storybook import
   * (see `main.tsx` and the `.storybook/preview` files), so one ordering covers the whole repo.
   */
  tailwindStylesheet: './packages/ui/src/globals.css',
}
