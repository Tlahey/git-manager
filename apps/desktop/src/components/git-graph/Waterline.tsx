interface WaterlineProps {
  label: string
}

/**
 * Séparateur temporel pleine largeur (« il y a 2 heures »…). Rendu en OVERLAY
 * sur la frontière entre deux commits : il n'occupe pas de hauteur dans le flux
 * et le graphe reste continu derrière lui.
 */
export function Waterline({ label }: WaterlineProps) {
  return (
    <div className="pointer-events-none flex h-full select-none items-center gap-2 px-3">
      <div className="h-px flex-1 bg-border/50" />
      <span className="shrink-0 rounded bg-muted px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
        {label}
      </span>
    </div>
  )
}
