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
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
