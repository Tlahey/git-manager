import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

import * as tauri from './tauri'

beforeEach(() => {
  mockInvoke.mockClear()
})

// Every export here is a thin `invoke<T>('command_name', {...})` pass-through with no branching
// of its own — the one thing that can genuinely be wrong is the command-name string or the
// argument-object shape not matching the Rust #[tauri::command] on the other side of the IPC
// boundary (a mismatch compiles fine in TS but fails silently/at-runtime against the real backend).
// This table asserts, for every wrapper, exactly what command name and argument shape it sends.
const cases: { name: string; call: () => unknown; command: string; args?: Record<string, unknown> }[] = [
  { name: 'openRepo', call: () => tauri.openRepo('/repo'), command: 'open_repo', args: { path: '/repo' } },
  { name: 'getRepoStatus', call: () => tauri.getRepoStatus('/repo'), command: 'get_repo_status', args: { path: '/repo' } },
  {
    name: 'scanRepos',
    call: () => tauri.scanRepos('/root', 3),
    command: 'scan_repos',
    args: { rootPath: '/root', maxDepth: 3 },
  },
  {
    name: 'cloneRepo',
    call: () => tauri.cloneRepo('https://x/repo.git', '/dest', true, false),
    command: 'clone_repo',
    args: { url: 'https://x/repo.git', destPath: '/dest', shallow: true, sparse: false },
  },
  { name: 'initRepo', call: () => tauri.initRepo('/repo'), command: 'init_repo', args: { path: '/repo' } },

  {
    name: 'getLog (no opts)',
    call: () => tauri.getLog('/repo'),
    command: 'get_log',
    args: { path: '/repo' },
  },
  {
    name: 'getLog (with opts)',
    call: () => tauri.getLog('/repo', { limit: 50, branch: 'main' }),
    command: 'get_log',
    args: { path: '/repo', limit: 50, branch: 'main' },
  },
  {
    name: 'getCommitDiff',
    call: () => tauri.getCommitDiff('/repo', 'abc'),
    command: 'get_commit_diff',
    args: { path: '/repo', oid: 'abc' },
  },
  {
    name: 'compareCommitToWorkdir',
    call: () => tauri.compareCommitToWorkdir('/repo', 'abc'),
    command: 'compare_commit_to_workdir',
    args: { path: '/repo', oid: 'abc' },
  },
  {
    name: 'getCommitFile',
    call: () => tauri.getCommitFile('/repo', 'abc', 'a.ts'),
    command: 'get_commit_file',
    args: { path: '/repo', oid: 'abc', filePath: 'a.ts' },
  },

  {
    name: 'getBranches (default includeRemote)',
    call: () => tauri.getBranches('/repo'),
    command: 'get_branches',
    args: { path: '/repo', includeRemote: true },
  },
  {
    name: 'getBranches (includeRemote false)',
    call: () => tauri.getBranches('/repo', false),
    command: 'get_branches',
    args: { path: '/repo', includeRemote: false },
  },
  { name: 'getTags', call: () => tauri.getTags('/repo'), command: 'get_tags', args: { path: '/repo' } },
  {
    name: 'createBranch',
    call: () => tauri.createBranch('/repo', 'feat', 'main'),
    command: 'create_branch',
    args: { path: '/repo', name: 'feat', fromRef: 'main' },
  },
  {
    name: 'checkoutBranch (default force)',
    call: () => tauri.checkoutBranch('/repo', 'feat'),
    command: 'checkout_branch',
    args: { path: '/repo', refName: 'feat', force: false },
  },
  {
    name: 'deleteBranch (defaults)',
    call: () => tauri.deleteBranch('/repo', 'feat'),
    command: 'delete_branch',
    args: { path: '/repo', name: 'feat', force: false, deleteRemote: false },
  },
  {
    name: 'renameBranch',
    call: () => tauri.renameBranch('/repo', 'old', 'new'),
    command: 'rename_branch',
    args: { path: '/repo', oldName: 'old', newName: 'new' },
  },
  {
    name: 'recreateBranchRef',
    call: () => tauri.recreateBranchRef('/repo', 'feat', 'abc', 'origin/feat'),
    command: 'recreate_branch_ref',
    args: { path: '/repo', name: 'feat', oid: 'abc', upstream: 'origin/feat' },
  },
  {
    name: 'createTag',
    call: () => tauri.createTag('/repo', 'v1', 'main', 'release'),
    command: 'create_tag',
    args: { path: '/repo', name: 'v1', fromRef: 'main', message: 'release' },
  },

  { name: 'stashList', call: () => tauri.stashList('/repo'), command: 'stash_list', args: { path: '/repo' } },
  {
    name: 'stashPush (defaults)',
    call: () => tauri.stashPush('/repo'),
    command: 'stash_push',
    args: { path: '/repo', message: undefined, includeUntracked: false },
  },
  {
    name: 'stashPop',
    call: () => tauri.stashPop('/repo', 2),
    command: 'stash_pop',
    args: { path: '/repo', index: 2 },
  },
  {
    name: 'stashApply',
    call: () => tauri.stashApply('/repo', 2),
    command: 'stash_apply',
    args: { path: '/repo', index: 2 },
  },
  {
    name: 'stashDrop',
    call: () => tauri.stashDrop('/repo', 0),
    command: 'stash_drop',
    args: { path: '/repo', index: 0 },
  },
  {
    name: 'stashStore',
    call: () => tauri.stashStore('/repo', 'abc', 'wip'),
    command: 'stash_store',
    args: { path: '/repo', commitOid: 'abc', message: 'wip' },
  },
  {
    name: 'editStashMessage',
    call: () => tauri.editStashMessage('/repo', 0, 'new message'),
    command: 'edit_stash_message',
    args: { path: '/repo', index: 0, message: 'new message' },
  },

  {
    name: 'listWorktrees',
    call: () => tauri.listWorktrees('/repo'),
    command: 'list_worktrees',
    args: { path: '/repo' },
  },
  {
    name: 'addWorktree',
    call: () => tauri.addWorktree('/repo', 'feat', '/repo-feat'),
    command: 'add_worktree',
    args: { path: '/repo', branch: 'feat', worktreePath: '/repo-feat' },
  },
  {
    name: 'removeWorktree (default force)',
    call: () => tauri.removeWorktree('/repo', '/repo-feat'),
    command: 'remove_worktree',
    args: { path: '/repo', worktreePath: '/repo-feat', force: false },
  },

  {
    name: 'getRebaseState',
    call: () => tauri.getRebaseState('/repo'),
    command: 'get_rebase_state',
    args: { path: '/repo' },
  },
  {
    name: 'listRebaseCommits',
    call: () => tauri.listRebaseCommits('/repo', 'base'),
    command: 'list_rebase_commits',
    args: { path: '/repo', baseOid: 'base' },
  },
  {
    name: 'runInteractiveRebase',
    call: () => tauri.runInteractiveRebase('/repo', 'base', []),
    command: 'run_interactive_rebase',
    args: { path: '/repo', baseOid: 'base', steps: [] },
  },
  {
    name: 'continueRebase',
    call: () => tauri.continueRebase('/repo', 'msg'),
    command: 'continue_rebase',
    args: { path: '/repo', message: 'msg' },
  },
  { name: 'abortRebase', call: () => tauri.abortRebase('/repo'), command: 'abort_rebase', args: { path: '/repo' } },
  { name: 'skipRebase', call: () => tauri.skipRebase('/repo'), command: 'skip_rebase', args: { path: '/repo' } },
  {
    name: 'rebaseOntoCommit',
    call: () => tauri.rebaseOntoCommit('/repo', 'target'),
    command: 'rebase_onto_commit',
    args: { path: '/repo', targetOid: 'target' },
  },

  {
    name: 'listConflictedFiles',
    call: () => tauri.listConflictedFiles('/repo'),
    command: 'list_conflicted_files',
    args: { path: '/repo' },
  },
  {
    name: 'getMergeView',
    call: () => tauri.getMergeView('/repo', 'a.ts'),
    command: 'get_merge_view',
    args: { path: '/repo', filePath: 'a.ts' },
  },
  {
    name: 'autoMergeConflictView',
    call: () => tauri.autoMergeConflictView('/repo', 'a.ts'),
    command: 'auto_merge_conflict_view',
    args: { path: '/repo', filePath: 'a.ts' },
  },
  {
    name: 'resolveConflict',
    call: () => tauri.resolveConflict('/repo', 'a.ts', 'content'),
    command: 'resolve_conflict',
    args: { path: '/repo', filePath: 'a.ts', resolvedContent: 'content' },
  },
  {
    name: 'resolveConflictBinary',
    call: () => tauri.resolveConflictBinary('/repo', 'a.bin', 'ours'),
    command: 'resolve_conflict_binary',
    args: { path: '/repo', filePath: 'a.bin', side: 'ours' },
  },

  {
    name: 'checkOllamaStatus',
    call: () => tauri.checkOllamaStatus('http://localhost:11434'),
    command: 'check_ollama_status',
    args: { url: 'http://localhost:11434' },
  },
  {
    name: 'generateCommitMessage',
    call: () => tauri.generateCommitMessage('/repo', 'llama3', 'hint'),
    command: 'generate_commit_message',
    args: { path: '/repo', model: 'llama3', promptHint: 'hint' },
  },
  { name: 'cancelGeneration', call: () => tauri.cancelGeneration(), command: 'cancel_generation' },

  { name: 'getUserThemes', call: () => tauri.getUserThemes(), command: 'get_user_themes' },

  {
    name: 'stageFile',
    call: () => tauri.stageFile('/repo', 'a.ts'),
    command: 'stage_file',
    args: { path: '/repo', filePath: 'a.ts' },
  },
  {
    name: 'unstageFile',
    call: () => tauri.unstageFile('/repo', 'a.ts'),
    command: 'unstage_file',
    args: { path: '/repo', filePath: 'a.ts' },
  },
  {
    name: 'discardFileChanges',
    call: () => tauri.discardFileChanges('/repo', 'a.ts'),
    command: 'discard_file_changes',
    args: { path: '/repo', filePath: 'a.ts' },
  },
  { name: 'stageAll', call: () => tauri.stageAll('/repo'), command: 'stage_all', args: { path: '/repo' } },
  { name: 'unstageAll', call: () => tauri.unstageAll('/repo'), command: 'unstage_all', args: { path: '/repo' } },
  {
    name: 'createCommit (defaults)',
    call: () => tauri.createCommit('/repo', 'msg'),
    command: 'create_commit',
    args: { path: '/repo', message: 'msg', amend: false, amendOid: undefined },
  },
  {
    name: 'createCommit (amend)',
    call: () => tauri.createCommit('/repo', 'msg', true, 'prevOid'),
    command: 'create_commit',
    args: { path: '/repo', message: 'msg', amend: true, amendOid: 'prevOid' },
  },
  {
    name: 'getStagedDiff',
    call: () => tauri.getStagedDiff('/repo'),
    command: 'get_staged_diff',
    args: { path: '/repo' },
  },
  {
    name: 'getFileDiff',
    call: () => tauri.getFileDiff('/repo', 'a.ts', true, 'abc'),
    command: 'get_file_diff',
    args: { path: '/repo', filePath: 'a.ts', staged: true, oid: 'abc' },
  },
  {
    name: 'getFileRawContents',
    call: () => tauri.getFileRawContents('/repo', 'a.ts', false),
    command: 'get_file_raw_contents',
    args: { path: '/repo', filePath: 'a.ts', staged: false, oid: undefined },
  },
  {
    name: 'getCommitFileVsWorkdir',
    call: () => tauri.getCommitFileVsWorkdir('/repo', 'abc', 'a.ts'),
    command: 'get_commit_file_vs_workdir',
    args: { path: '/repo', oid: 'abc', filePath: 'a.ts' },
  },
  {
    name: 'isCommitOnCurrentBranch',
    call: () => tauri.isCommitOnCurrentBranch('/repo', 'abc'),
    command: 'is_commit_on_current_branch',
    args: { path: '/repo', oid: 'abc' },
  },

  {
    name: 'fetchRemote',
    call: () => tauri.fetchRemote('/repo', 'origin'),
    command: 'fetch_remote',
    args: { path: '/repo', remote: 'origin' },
  },
  {
    name: 'pullBranch',
    call: () => tauri.pullBranch('/repo', 'origin', true),
    command: 'pull_branch',
    args: { path: '/repo', remote: 'origin', rebase: true },
  },
  {
    name: 'pushBranch',
    call: () => tauri.pushBranch('/repo', 'origin', true),
    command: 'push_branch',
    args: { path: '/repo', remote: 'origin', force: true },
  },
  { name: 'getRemotes', call: () => tauri.getRemotes('/repo'), command: 'get_remotes', args: { path: '/repo' } },
  {
    name: 'addRemote',
    call: () => tauri.addRemote('/repo', 'origin', 'https://x/repo.git'),
    command: 'add_remote',
    args: { path: '/repo', name: 'origin', url: 'https://x/repo.git' },
  },
  {
    name: 'removeRemote',
    call: () => tauri.removeRemote('/repo', 'origin'),
    command: 'remove_remote',
    args: { path: '/repo', name: 'origin' },
  },
  {
    name: 'getCommitWebUrl',
    call: () => tauri.getCommitWebUrl('/repo', 'abc', 'origin'),
    command: 'get_commit_web_url',
    args: { path: '/repo', oid: 'abc', remote: 'origin' },
  },

  {
    name: 'snapshotFile',
    call: () => tauri.snapshotFile('/repo', 'a.ts', 'entry-1'),
    command: 'snapshot_file',
    args: { path: '/repo', filePath: 'a.ts', entryId: 'entry-1' },
  },
  {
    name: 'restoreFileBlob',
    call: () => tauri.restoreFileBlob('/repo', 'a.ts', 'blobOid'),
    command: 'restore_file_blob',
    args: { path: '/repo', filePath: 'a.ts', blobOid: 'blobOid' },
  },
  {
    name: 'snapshotWorktree',
    call: () => tauri.snapshotWorktree('/repo', 'entry-1'),
    command: 'snapshot_worktree',
    args: { path: '/repo', entryId: 'entry-1' },
  },
  {
    name: 'snapshotWorktreeAlways',
    call: () => tauri.snapshotWorktreeAlways('/repo', 'entry-1'),
    command: 'snapshot_worktree_always',
    args: { path: '/repo', entryId: 'entry-1' },
  },
  {
    name: 'pinObject',
    call: () => tauri.pinObject('/repo', 'refs/pins/1', 'abc'),
    command: 'pin_object',
    args: { path: '/repo', refName: 'refs/pins/1', oid: 'abc' },
  },
  {
    name: 'unpinObject',
    call: () => tauri.unpinObject('/repo', 'refs/pins/1'),
    command: 'unpin_object',
    args: { path: '/repo', refName: 'refs/pins/1' },
  },
  {
    name: 'objectsExist',
    call: () => tauri.objectsExist('/repo', ['a', 'b']),
    command: 'objects_exist',
    args: { path: '/repo', oids: ['a', 'b'] },
  },

  { name: 'getSettings', call: () => tauri.getSettings(), command: 'get_settings' },
  {
    name: 'updateSettings',
    call: () => tauri.updateSettings({ language: 'fr' }),
    command: 'update_settings',
    args: { settings: { language: 'fr' } },
  },

  {
    name: 'revertCommit (default noCommit)',
    call: () => tauri.revertCommit('/repo', 'abc'),
    command: 'revert_commit',
    args: { path: '/repo', oid: 'abc', noCommit: false },
  },
  {
    name: 'resetToCommit',
    call: () => tauri.resetToCommit('/repo', 'abc', 'hard'),
    command: 'reset_to_commit',
    args: { path: '/repo', oid: 'abc', mode: 'hard' },
  },
  {
    name: 'getCommitsBetween',
    call: () => tauri.getCommitsBetween('/repo', 'a', 'b'),
    command: 'get_commits_between',
    args: { path: '/repo', fromOid: 'a', toOid: 'b' },
  },
  {
    name: 'cherryPickCommit',
    call: () => tauri.cherryPickCommit('/repo', 'abc'),
    command: 'cherry_pick_commit',
    args: { path: '/repo', oid: 'abc' },
  },
  {
    name: 'createPatch',
    call: () => tauri.createPatch('/repo', 'abc', '/out.patch'),
    command: 'create_patch',
    args: { path: '/repo', oid: 'abc', destPath: '/out.patch' },
  },

  {
    name: 'createFixupCommit',
    call: () => tauri.createFixupCommit('/repo', 'target', 'fixup!'),
    command: 'create_fixup_commit',
    args: { path: '/repo', targetOid: 'target', message: 'fixup!' },
  },
  {
    name: 'getPendingFixups',
    call: () => tauri.getPendingFixups('/repo'),
    command: 'get_pending_fixups',
    args: { path: '/repo' },
  },
  {
    name: 'autosquashPreview',
    call: () => tauri.autosquashPreview('/repo'),
    command: 'autosquash_preview',
    args: { path: '/repo' },
  },
  { name: 'runAutosquash', call: () => tauri.runAutosquash('/repo'), command: 'run_autosquash', args: { path: '/repo' } },

  {
    name: 'listSubmodules',
    call: () => tauri.listSubmodules('/repo'),
    command: 'list_submodules',
    args: { path: '/repo' },
  },

  {
    name: 'githubDeviceCode',
    call: () => tauri.githubDeviceCode('repo'),
    command: 'github_device_code',
    args: { scope: 'repo' },
  },
  {
    name: 'githubPollToken',
    call: () => tauri.githubPollToken('device-code'),
    command: 'github_poll_token',
    args: { deviceCode: 'device-code' },
  },
  {
    name: 'githubGetUser',
    call: () => tauri.githubGetUser('token-1'),
    command: 'github_get_user',
    args: { token: 'token-1' },
  },
  {
    name: 'githubListRepos',
    call: () => tauri.githubListRepos('token-1'),
    command: 'github_list_repos',
    args: { token: 'token-1' },
  },

  {
    name: 'getRepoSummary',
    call: () => tauri.getRepoSummary('/repo'),
    command: 'get_repo_summary',
    args: { path: '/repo' },
  },
  {
    name: 'openInEditor',
    call: () => tauri.openInEditor('/repo', 'vscode', 'code {path}'),
    command: 'open_in_editor',
    args: { path: '/repo', editor: 'vscode', customCommand: 'code {path}' },
  },
  {
    name: 'getRepoReadme',
    call: () => tauri.getRepoReadme('/repo'),
    command: 'get_repo_readme',
    args: { path: '/repo' },
  },
  { name: 'getTerminalCommands', call: () => tauri.getTerminalCommands(), command: 'get_terminal_commands' },

  {
    name: 'generateSshKey',
    call: () => tauri.generateSshKey('ed25519', null, 'me@host', '/id_ed25519', 'pass'),
    command: 'generate_ssh_key',
    args: { keyType: 'ed25519', bits: null, comment: 'me@host', path: '/id_ed25519', passphrase: 'pass' },
  },
  {
    name: 'readSshPublicKey',
    call: () => tauri.readSshPublicKey('/id_ed25519.pub'),
    command: 'read_ssh_public_key',
    args: { path: '/id_ed25519.pub' },
  },
]

describe('lib/tauri — IPC wrapper command names and argument shapes', () => {
  it.each(cases)('$name', ({ call, command, args }) => {
    call()
    if (args === undefined) {
      expect(mockInvoke).toHaveBeenCalledWith(command)
    } else {
      expect(mockInvoke).toHaveBeenCalledWith(command, args)
    }
  })
})

describe('lib/tauri — restoreWorktreeSnapshot', () => {
  it('only forwards indexTreeOid/workdirTreeOid, dropping the ref-name fields', () => {
    tauri.restoreWorktreeSnapshot('/repo', {
      indexTreeOid: 'index-oid',
      workdirTreeOid: 'workdir-oid',
      indexRefName: 'refs/snapshots/index',
      workdirRefName: 'refs/snapshots/workdir',
    })
    expect(mockInvoke).toHaveBeenCalledWith('restore_worktree_snapshot', {
      path: '/repo',
      indexTreeOid: 'index-oid',
      workdirTreeOid: 'workdir-oid',
    })
  })
})
