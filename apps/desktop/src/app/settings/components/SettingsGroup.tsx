interface SettingsGroupProps {
  /** Short heading — the question this block answers ("Provider", "Models", "Limits"). */
  title: string
  /** One line under the title when the group needs framing. Omit rather than pad. */
  description?: string
  /**
   * Whether to draw the separating rule above the group. The first group on a page passes `false`,
   * so a page never opens on a line with nothing above it.
   */
  divided?: boolean
  children: React.ReactNode
  testId?: string
}

/**
 * One titled block of settings, separated from the next by a rule.
 *
 * The AI page is what forced this out: it had grown to a flat run of eleven fields — provider, URL,
 * key, two models, timeout, context window, then feature toggles — every one styled identically and
 * spaced identically, so nothing said where "reaching the model" stopped and "what it may spend"
 * began. A wall of equally-weighted fields is read as a wall, and the fields that matter most (the
 * model, and whether it honors structured output) sank into it.
 *
 * Deliberately dumb: a heading, an optional line, a rule, and whatever is put inside. It holds no
 * state and knows nothing about AI, so the other long pages can adopt it without inheriting
 * anything.
 */
export function SettingsGroup({
  title,
  description,
  divided = true,
  children,
  testId,
}: SettingsGroupProps) {
  return (
    <section
      data-testid={testId}
      className={divided ? 'space-y-4 border-t border-border pt-5' : 'space-y-4'}
    >
      <div className="space-y-0.5">
        <h4 className="text-xs font-semibold text-foreground">{title}</h4>
        {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}
