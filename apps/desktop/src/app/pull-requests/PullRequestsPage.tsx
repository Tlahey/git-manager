import { GitPullRequest, Zap, Keyboard } from 'lucide-react'

interface SectionProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/**
 * Vue transversale (multi-dépôts) : Pull Requests de l'utilisateur,
 * actions GitHub et raccourcis. Contenu enrichi au fil des itérations.
 */
export function PullRequestsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <GitPullRequest className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">Pull Requests</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto grid max-w-3xl gap-4">
          <Section icon={<GitPullRequest className="h-4 w-4" />} title="Mes Pull Requests">
            <p className="text-xs text-muted-foreground">
              Les PRs ouvertes sur vos dépôts GitHub apparaîtront ici.
            </p>
          </Section>

          <Section icon={<Zap className="h-4 w-4" />} title="Actions GitHub">
            <p className="text-xs text-muted-foreground">
              Statuts d'intégration continue et workflows récents.
            </p>
          </Section>

          <Section icon={<Keyboard className="h-4 w-4" />} title="Raccourcis">
            <p className="text-xs text-muted-foreground">
              Accès rapide aux dépôts et actions fréquentes.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
