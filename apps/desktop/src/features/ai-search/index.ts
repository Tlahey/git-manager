/**
 * AI commit search — the feature's whole public surface.
 *
 * One name, because one thing outside this folder needs it: `AiSidePanel` renders the panel when
 * the graph's `aiPanelTarget` says `commitSearch`. Everything else the feature is — its hook, its
 * persisted history, its notch card, its four list views — is an implementation detail of that
 * panel, and keeping the barrel this narrow is what makes that true rather than aspirational.
 */
export { AiCommitSearchPanel } from './components/AiCommitSearchPanel'
