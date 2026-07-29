/**
 * Lets `tsc` resolve the theme's single-file component. Only the shape of the
 * import matters here: `tsc` does not look inside `.vue` files (that needs
 * `vue-tsc`), and this site has exactly one component.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
