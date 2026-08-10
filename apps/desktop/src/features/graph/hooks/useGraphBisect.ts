import { useMemo } from 'react'
import { useBisectState } from '../../../hooks/useBisectState'
import { useBisectUIStore } from '../../../stores/bisectUI.store'
import { buildBisectStatusMap } from '../lib/bisectStatus'
import { isSyntheticRow } from '../lib/syntheticRows'

/**
 * What a running `git bisect` session adds to the graph: a per-row annotation, and a click that
 * fills a slot instead of selecting a commit.
 *
 * The pending bad/good oids are previewed with the same row treatment as a confirmed one, so the
 * two commits being chosen look during setup exactly as they will once the session starts.
 */
export function useGraphBisect(repoPath: string) {
  const { data: bisect } = useBisectState(repoPath)
  const isSettingUp = useBisectUIStore((s) => s.setupActive)
  const pendingBadOid = useBisectUIStore((s) => s.pendingBadOid)
  const pendingGoodOid = useBisectUIStore((s) => s.pendingGoodOid)

  const statusMap = useMemo(() => {
    const map = buildBisectStatusMap(bisect)
    if (pendingBadOid) map.set(pendingBadOid, 'bad')
    if (pendingGoodOid) map.set(pendingGoodOid, 'good')
    return map
  }, [bisect, pendingBadOid, pendingGoodOid])

  /**
   * During graph-driven setup, a commit click fills the active bisect slot instead of selecting it.
   * Synthetic rows (WIP / CONFLICT) are not valid bisect targets — there is no commit to mark.
   */
  function pickCommit(oid: string) {
    if (isSyntheticRow(oid)) return
    useBisectUIStore.getState().pickCommit(oid)
  }

  return { bisect, isActive: bisect?.active ?? false, isSettingUp, statusMap, pickCommit }
}
