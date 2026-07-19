import type { GitGraphNode, GitRef } from '@git-manager/git-types'

const isMainish = (shortName: string) =>
  shortName === 'main' ||
  shortName === 'master' ||
  shortName.endsWith('/main') ||
  shortName.endsWith('/master')

interface Tip {
  oid: string
  ref: GitRef
  priority: number
}

/**
 * Maps each commit OID to the branch it should be attributed to, so a commit with no ref badge of
 * its own can hint — on hover — which branch it belongs to.
 *
 * A commit is attributed to the **highest-priority branch that contains it** (i.e. from whose tip it
 * is reachable through *any* parent, not just the first — so commits merged into a branch count as
 * part of it). Priority is: local `main`/`master` first, then other local branches, then remotes;
 * ties keep the caller's order (newest-first). Concretely we walk each tip's full ancestor DAG in
 * priority order, claiming unclaimed commits and pruning at already-claimed ones — every ancestor of
 * a claimed commit is itself claimed, so pruning is safe and the whole pass stays O(V + E). Net
 * effect: anything reachable from `main` shows `main`; a feature branch only owns the commits unique
 * to it (those not contained in a higher-priority branch).
 *
 * Reachability is used rather than lane colour because the backend's 8-hue palette recycles — it
 * even reuses main's exact blue/purple — so colour can't identify a branch.
 */
export function computeLaneBranchByOid(nodes: GitGraphNode[]): Map<string, GitRef> {
  const byOid = new Map(nodes.map((n) => [n.commit.oid, n] as const))
  const owner = new Map<string, GitRef>()

  // One tip per branch/remote ref — several branches can point at the same commit (e.g. `main`,
  // `origin/main` and a couple of `claude/*` branches all on the current tip), and we must register
  // `main` as its own priority-0 tip rather than pick whichever ref happens to be first.
  const tips: Tip[] = []
  for (const n of nodes) {
    for (const r of n.refs) {
      if (r.type !== 'branch' && r.type !== 'remote') continue
      const priority = isMainish(r.shortName) ? 0 : r.type === 'branch' ? 1 : 2
      tips.push({ oid: n.commit.oid, ref: r, priority })
    }
  }

  // Stable sort keeps the caller's (newest-first) node order within each priority tier.
  tips.sort((a, b) => a.priority - b.priority)

  for (const tip of tips) {
    // Full ancestor walk (every parent). Pruning at an already-owned commit is safe: all of its
    // ancestors were claimed when that owner ran, so nothing unique is missed.
    const stack = [tip.oid]
    while (stack.length > 0) {
      const cur = stack.pop() as string
      if (owner.has(cur)) continue
      const n = byOid.get(cur)
      if (!n) continue // parent outside the loaded window
      owner.set(cur, tip.ref)
      for (const p of n.commit.parentOids) stack.push(p)
    }
  }

  return owner
}
