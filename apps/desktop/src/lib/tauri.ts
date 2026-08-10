/**
 * The frontend→backend IPC layer: one typed wrapper per Tauri command.
 *
 * This file is the barrel. The wrappers live in `lib/tauri/`, one module per domain, mirroring the
 * Rust command files they call into (`commands/*.rs`) rather than inventing a second grouping —
 * `branch.ts` wraps `branch.rs`, `stash.ts` wraps `stash.rs`, and so on. It stayed one 1329-line
 * file for a long time because every wrapper is a one-liner and nothing forced the issue; what
 * forced it is that the one part of it that is *not* a one-liner — the `invoke` chokepoint and its
 * activity recording — was buried under eleven hundred lines of them.
 *
 * The barrel exists so the split changed no import anywhere: everything in the app imports from
 * `lib/tauri`, and the layering rule above it is unchanged — components, hooks and stores go
 * through `api/*.api.ts`, never here (see CLAUDE.md; several `api*` wrappers also drive undo/redo
 * and the achievements event bus, so bypassing them silently drops that behaviour).
 *
 * @see lib/tauri/invoke.ts — the chokepoint every wrapper below goes through, and the only file
 * here with logic in it.
 */

export { recordActivity, type AppErrorLike } from './tauri/invoke'

export * from './tauri/activityLog'
export * from './tauri/repo'
export * from './tauri/log'
export * from './tauri/branch'
export * from './tauri/stash'
export * from './tauri/worktree'
export * from './tauri/rebase'
export * from './tauri/ai'
export * from './tauri/config'
export * from './tauri/workingTree'
export * from './tauri/remote'
export * from './tauri/undo'
export * from './tauri/forge'
export * from './tauri/system'
export * from './tauri/board'
