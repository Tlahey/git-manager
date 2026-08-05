import type { SVGProps } from 'react'
import { cn } from '../lib/utils'

/**
 * The GitHub and GitLab marks.
 *
 * These live here instead of coming from `lucide-react` because lucide **deprecated its whole brand
 * set** and schedules it for removal in v1.0 (see lucide-icons/lucide#670) — so `import { Github }
 * from 'lucide-react'` is a build break waiting on the next major bump, on icons that sit in the
 * settings integrations panel, the footer, the commit header and the PR views.
 *
 * The geometry is lucide's own, copied verbatim at the moment of the move, so nothing changes on
 * screen. They keep the house drawing contract — 24×24 grid, 2px stroke, round caps and joins,
 * `currentColor` — so they stay indistinguishable from the lucide icons they sit beside, and take
 * the full SVG prop set like {@link LlmIcon} so a caller can attach a `data-testid` or an
 * `aria-label` when the icon is the only thing naming the action.
 */
function ForgeIcon({
  className,
  children,
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      // Stable hook for tests and styling, standing in for the `lucide-<name>` class the
      // deprecated lucide icons used to carry.
      data-icon={name}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <ForgeIcon name="github" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </ForgeIcon>
  )
}

export function GitlabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <ForgeIcon name="gitlab" {...props}>
      <path d="m22 13.29-3.33-10a.42.42 0 0 0-.14-.18.38.38 0 0 0-.22-.11.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18l-2.26 6.67H8.32L6.1 3.26a.42.42 0 0 0-.1-.18.38.38 0 0 0-.26-.08.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18L2 13.29a.74.74 0 0 0 .27.83L12 21l9.69-6.88a.71.71 0 0 0 .31-.83Z" />
    </ForgeIcon>
  )
}

export interface GithubMarkProps extends SVGProps<SVGSVGElement> {
  /** The accessible name. Pass `''` to make the mark decorative instead. */
  title?: string
}

/**
 * The **solid** GitHub logo — the Octocat silhouette, not the outline {@link GithubIcon} draws.
 *
 * It is a separate component rather than a `filled` prop on `GithubIcon` because the two differ in
 * three ways, and only one of them is the fill: different path data, `fill`-based painting instead
 * of a 2px stroke, and — the reason a boolean would be wrong — a different accessibility contract.
 * `GithubIcon` is decorative (`aria-hidden`), sitting beside a text label that already names the
 * thing. This one is *announced*, because where it's used (a remote ref badge in the commit graph)
 * it is the only thing saying "this branch lives on a remote"; a prop that silently decides whether
 * a screen reader speaks the element would hide that choice behind a styling flag.
 *
 * Sized by the caller through `className`, like every icon here.
 */
export function GithubMark({ className, title = 'GitHub', ...props }: GithubMarkProps) {
  const decorative = title === ''
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      data-icon="github-mark"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      {...props}
    >
      {!decorative && <title>{title}</title>}
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}
