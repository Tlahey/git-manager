import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // Component-token layer (Tier 3): each filled Button variant defaults to
        // its semantic pair via themes.css, so a button-only fix (incl. per-theme
        // a11y overrides) is a token change, not a code change. Graded by
        // evaluateComponentContrast in @git-manager/theme.
        button: {
          DEFAULT: 'hsl(var(--button-bg))',
          foreground: 'hsl(var(--button-foreground))',
          secondary: 'hsl(var(--button-secondary-bg))',
          'secondary-foreground': 'hsl(var(--button-secondary-foreground))',
          destructive: 'hsl(var(--button-destructive-bg))',
          'destructive-foreground': 'hsl(var(--button-destructive-foreground))',
          success: 'hsl(var(--button-success-bg))',
          'success-foreground': 'hsl(var(--button-success-foreground))',
        },
        // The selected segment of a segmented control. Aliases the button pair, but from :root —
        // so it keeps the content fill inside .chrome-surface, where --button-* is re-pointed at
        // the far flatter sidebar accent. See packages/theme/src/themes.css.
        'control-active': {
          DEFAULT: 'hsl(var(--control-active-bg))',
          foreground: 'hsl(var(--control-active-foreground))',
        },
        // Component token for the default Badge fill — defaults to --primary, but a
        // theme can re-point it (Twilight uses a deeper violet so the chip stays
        // visible + AA). Graded by evaluateComponentContrast.
        badge: {
          DEFAULT: 'hsl(var(--badge-bg))',
          foreground: 'hsl(var(--badge-foreground))',
          // Secondary/destructive Badge variants get their own tokens (default to
          // --secondary/--destructive) so a theme can fix the chip label's contrast
          // without moving the semantic color it borrows from.
          secondary: 'hsl(var(--badge-secondary-bg))',
          'secondary-foreground': 'hsl(var(--badge-secondary-foreground))',
          destructive: 'hsl(var(--badge-destructive-bg))',
          'destructive-foreground': 'hsl(var(--badge-destructive-foreground))',
        },
        // Soft "tone" chip text (Tag + Badge success/warning/danger/info). The chip
        // fill stays a translucent /15 tint of the tone color; only the *text* rides
        // these tokens, so a theme can darken/lighten it per surface for AA. `link`
        // is the same idea for the link button / inline links (ex-text-primary).
        'tone-success': 'hsl(var(--tone-success-foreground))',
        'tone-warning': 'hsl(var(--tone-warning-foreground))',
        'tone-danger': 'hsl(var(--tone-danger-foreground))',
        'tone-info': 'hsl(var(--tone-info-foreground))',
        link: 'hsl(var(--link))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
        },
        'sidebar-border': 'hsl(var(--sidebar-border))',
        'sidebar-accent': {
          DEFAULT: 'hsl(var(--sidebar-accent))',
          foreground: 'hsl(var(--sidebar-accent-foreground))',
        },
        'sidebar-muted-foreground': 'hsl(var(--sidebar-muted-foreground))',
        // Git graph palette (stable colors for branches)
        'graph-1': '#7c3aed',
        'graph-2': '#2563eb',
        'graph-3': '#16a34a',
        'graph-4': '#d97706',
        'graph-5': '#dc2626',
        'graph-6': '#0891b2',
        'graph-7': '#be185d',
        'graph-8': '#65a30d',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      // Central stacking scale (Tier: layout). Values live as `--z-*` CSS variables in
      // packages/ui/src/globals.css (the single source of truth — theme-independent, unlike
      // colors), and these named utilities (`z-popover`, `z-graph-row-hover`, …) map to them so a
      // component never hardcodes a magic z-index. Adding/reordering a layer is a one-file change
      // in globals.css. Merged onto Tailwind's defaults, so plain `z-10`/`z-50` still work.
      zIndex: {
        'graph-overflow': 'var(--z-graph-overflow)',
        content: 'var(--z-content)',
        raised: 'var(--z-raised)',
        'resize-handle': 'var(--z-resize-handle)',
        'graph-row-hover': 'var(--z-graph-row-hover)',
        panel: 'var(--z-panel)',
        popover: 'var(--z-popover)',
        notification: 'var(--z-notification)',
        overlay: 'var(--z-overlay)',
        tooltip: 'var(--z-tooltip)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Shared keyframes. Only for animations a *primitive* in packages/ui needs — a keyframe used
      // by exactly one feature component belongs in a scoped <style> next to it (see the notch
      // card's halo pulse), not here, where it costs every consumer a rule nothing references.
      keyframes: {
        // The sliver that travels across an indeterminate <Progress> track. Overshoots on both
        // sides so the bar enters and leaves cleanly instead of appearing to bounce off the ends.
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'progress-indeterminate': 'progress-indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // The `animate-in`/`animate-out` + `fade-*`/`zoom-*`/`slide-*` vocabulary every shadcn/ui
    // component in packages/ui is written against comes from `tw-animate-css` now — imported as
    // plain CSS (`@import "tw-animate-css";`) next to `@import "tailwindcss";` in each package's
    // entry stylesheet, not registered as a plugin here. `tailwindcss-animate` (the old JS-plugin
    // form) was never updated for Tailwind v4's engine; `tw-animate-css` is its v4-native
    // replacement.
    plugin(({ matchUtilities, theme }) => {
      // `animate-duration-*` times a keyframe animation, and ONLY that.
      //
      // Reach for it instead of Tailwind's `duration-*` next to an `animate-in`/`animate-out`.
      // Core's `duration-*` sets `transition-duration`, and tailwindcss-animate additionally
      // teaches it `animation-duration` — so on an element with no `transition-*` class it also
      // leaves `transition-property` at its CSS initial value, `all`, quietly turning every later
      // property change into an animation. That is not theoretical: it is what made the shared
      // Tooltip slide into place from off-screen, since the bubble is positioned from JS after
      // being measured (see packages/ui/src/components/tooltip.tsx).
      matchUtilities(
        { 'animate-duration': (value) => ({ animationDuration: value }) },
        { values: theme('transitionDuration') }
      )
    }),
  ],
}
