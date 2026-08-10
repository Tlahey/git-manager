import type { useWipCommitPanel } from '../hooks/useWipCommitPanel'

/**
 * Everything {@link useWipCommitPanel} exposes, as one value.
 *
 * The three forms split out of `WipStagingPanel` each take this whole object rather than a
 * hand-picked slice of it. That is deliberate: they are not reusable components but three views of
 * a single piece of state — the same tab bar switches between two of them, and the batch panel
 * shares the commit form's generation flags. Threading twelve to fifteen individual props into each
 * would state that coupling three times over, and drift the moment the hook gains a field.
 *
 * It also keeps the panel's suite working as written: it mocks the hook and hands the component a
 * full state object, which is exactly what travels down from here.
 */
export type WipCommitPanelState = ReturnType<typeof useWipCommitPanel>
