/**
 * What each backend operation would have been, typed by hand in a terminal.
 *
 * This is the whole substance of the "Behind the scenes" window: the activity log records IPC command
 * names (`stage_file`, `create_commit`), which say what the *app* did and teach nothing about git. The
 * catalog turns each of them back into the `git` command line it stands for, which is the artifact a
 * user can read, copy, look up, and eventually type themselves.
 *
 * Two rules decide what belongs here:
 *
 * 1. **Only operations that change something.** The app issues far more reads than writes — a repo
 *    under polling logs `get_repo_status` and `get_log` continuously — and none of them are actions
 *    the user took. Absence from this catalog is therefore meaningful: it is how
 *    {@link isGitCommandOperation} tells an action from noise, and the window shows nothing else.
 * 2. **Only commands we can render honestly.** A rendering that is *almost* right is worse than none
 *    in a feature whose point is to teach, and worse again once a model is asked to explain it. So the
 *    undo/redo plumbing (`snapshot_file`, `restore_file_blob`, `pin_object`, …) is deliberately
 *    absent: those are the *mechanism* by which the app reverses an action, not commands anyone would
 *    type, and the operation being undone is already in the pool on its own line.
 *
 * Renderings use placeholders (`<file>`, `<oid>`) when an argument was not recorded, rather than
 * emitting a command with a hole in it. Values come from the activity log, so they are already
 * redacted and truncated to 200 characters (see `debugLogRedact.ts`).
 */

/** Broad family of an operation, for the row's icon and colour — not sent to the model. */
export type GitCommandFamily =
  | 'staging'
  | 'commit'
  | 'branch'
  | 'history'
  | 'remote'
  | 'stash'
  | 'worktree'
  | 'conflict'
  | 'repo'

/** Recorded arguments of one IPC call, as they come out of the activity log. */
type RecordedArgs = Record<string, unknown>

interface GitCommandSpec {
  /** i18n key (namespace `common`) for the one-line title of what the user did. A key rather than a
   * string because this is a module-level map and cannot call `t()`. */
  titleKey: string
  family: GitCommandFamily
  /**
   * The git command line(s) this operation stands for.
   *
   * A list, not a string, because several genuinely are more than one command: merging a branch the
   * app is not on checks it out first, and resolving a conflict against one side checks that side out
   * before staging it. Collapsing those into one line with `&&` would misrepresent what ran.
   */
  render(args: RecordedArgs): string[]
}

/** A recorded string argument, or `undefined` when it wasn't captured or isn't a string. */
function str(args: RecordedArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** A recorded boolean argument. Optional flags arrive as `undefined` when the caller omitted them. */
function flag(args: RecordedArgs, key: string): boolean {
  return args[key] === true
}

/** A recorded numeric argument, tolerating the string form a JSON round-trip can produce. */
function num(args: RecordedArgs, key: string): number | undefined {
  const value = args[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

/**
 * Quotes a value for a POSIX shell, so the rendered line stays copy-pastable.
 *
 * The lines are meant to be read *and* run — a user learning git will paste one — so a path with a
 * space in it has to survive the trip. Single quotes with the standard `'\''` escape, applied only
 * when the value actually needs them, because quoting every argument would bury the command in
 * punctuation.
 */
function sh(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./^{}~-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * A recorded value quoted for the shell, or `placeholder` when the argument wasn't captured.
 *
 * Placeholders bypass the quoting on purpose: `<file>` is a gap the reader is meant to notice and
 * fill, and `'<file>'` would read as a filename literally called that.
 */
function shOr(value: string | undefined, placeholder: string): string {
  return value === undefined ? placeholder : sh(value)
}

/** First line of a commit/stash message, for a command line that has to stay one line. */
function firstLine(message: string): string {
  return message.split('\n')[0]?.trim() ?? ''
}

/**
 * A remote URL with any embedded credentials removed.
 *
 * The activity log keeps remote URLs — its own redaction only drops whole arguments for
 * auth-shaped *command names* — and this catalog is the one thing the AI explanation sends to a
 * provider. `https://user:token@host/repo.git` in a prompt would be a credential leaving the machine,
 * so the userinfo goes before anything is rendered.
 */
function scrubUrl(url: string): string {
  return url.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]*@/, '$1')
}

/** A remote URL, credential-free and shell-quoted, or the placeholder when none was recorded. */
function urlArg(args: RecordedArgs): string {
  const url = str(args, 'url')
  return url === undefined ? '<url>' : sh(scrubUrl(url))
}

/** A commit/stash message's subject line, shell-quoted, or the placeholder when none was recorded. */
function messageArg(args: RecordedArgs): string {
  const message = str(args, 'message')
  return message === undefined ? '<message>' : sh(firstLine(message))
}

/** `stash@{n}` for the entry an operation targeted; index 0 (the top of the stack) is git's default
 * and the commands accept the bare form, but naming it is clearer to read. */
function stashRef(args: RecordedArgs): string {
  return `stash@{${num(args, 'index') ?? 0}}`
}

/** Short form of an oid, so a command line reads like one a human wrote. */
function shortOid(oid: string): string {
  return /^[0-9a-f]{40}$/i.test(oid) ? oid.slice(0, 7) : oid
}

function oidArg(args: RecordedArgs, key = 'oid'): string {
  const oid = str(args, key)
  return oid ? shortOid(oid) : '<commit>'
}

/** Remote name, defaulting the way the backend does when the argument is absent. */
function remote(args: RecordedArgs): string {
  return str(args, 'remote') ?? 'origin'
}

const CATALOG: Record<string, GitCommandSpec> = {
  // ─── Staging ────────────────────────────────────────────────────────────────
  stage_file: {
    titleKey: 'gitCommand.stageFile',
    family: 'staging',
    render: (a) => [`git add -- ${shOr(str(a, 'filePath'), '<file>')}`],
  },
  unstage_file: {
    titleKey: 'gitCommand.unstageFile',
    family: 'staging',
    render: (a) => [`git restore --staged -- ${shOr(str(a, 'filePath'), '<file>')}`],
  },
  discard_file_changes: {
    titleKey: 'gitCommand.discardFile',
    family: 'staging',
    render: (a) => [`git restore -- ${shOr(str(a, 'filePath'), '<file>')}`],
  },
  stage_all: { titleKey: 'gitCommand.stageAll', family: 'staging', render: () => ['git add -A'] },
  unstage_all: {
    titleKey: 'gitCommand.unstageAll',
    family: 'staging',
    render: () => ['git reset'],
  },

  // ─── Commits ────────────────────────────────────────────────────────────────
  create_commit: {
    titleKey: 'gitCommand.commit',
    family: 'commit',
    render: (a) => [`git commit${flag(a, 'amend') ? ' --amend' : ''} -m ${messageArg(a)}`],
  },
  create_fixup_commit: {
    titleKey: 'gitCommand.fixup',
    family: 'commit',
    render: (a) => [`git commit --fixup ${oidArg(a, 'targetOid')}`],
  },
  run_autosquash: {
    titleKey: 'gitCommand.autosquash',
    family: 'commit',
    render: () => ['git rebase --interactive --autosquash'],
  },
  revert_commit: {
    titleKey: 'gitCommand.revert',
    family: 'commit',
    render: (a) => [`git revert${flag(a, 'noCommit') ? ' --no-commit' : ''} ${oidArg(a)}`],
  },
  cherry_pick_commit: {
    titleKey: 'gitCommand.cherryPick',
    family: 'commit',
    render: (a) => [`git cherry-pick ${oidArg(a)}`],
  },
  reset_to_commit: {
    titleKey: 'gitCommand.reset',
    family: 'history',
    render: (a) => [`git reset --${str(a, 'mode') ?? 'mixed'} ${oidArg(a)}`],
  },

  // ─── Branches & tags ────────────────────────────────────────────────────────
  create_branch: {
    titleKey: 'gitCommand.createBranch',
    family: 'branch',
    render: (a) => {
      const from = str(a, 'fromRef')
      const head = `git branch ${shOr(str(a, 'name'), '<branch>')}`
      return [from ? `${head} ${sh(from)}` : head]
    },
  },
  checkout_branch: {
    titleKey: 'gitCommand.checkout',
    family: 'branch',
    // `checkout` rather than `switch`: this command also takes a raw oid (restoring a detached HEAD
    // when a checkout is undone), which `switch` refuses without `--detach`.
    render: (a) => [
      `git checkout${flag(a, 'force') ? ' --force' : ''} ${shOr(str(a, 'refName'), '<ref>')}`,
    ],
  },
  delete_branch: {
    titleKey: 'gitCommand.deleteBranch',
    family: 'branch',
    render: (a) => {
      const name = shOr(str(a, 'name'), '<branch>')
      const local = `git branch ${flag(a, 'force') ? '-D' : '-d'} ${name}`
      return flag(a, 'deleteRemote') ? [local, `git push origin --delete ${name}`] : [local]
    },
  },
  create_tag: {
    titleKey: 'gitCommand.createTag',
    family: 'branch',
    render: (a) => {
      const name = shOr(str(a, 'name'), '<tag>')
      const from = str(a, 'fromRef')
      const message = str(a, 'message')
      const head = message ? `git tag -a ${name} -m ${sh(firstLine(message))}` : `git tag ${name}`
      return [from ? `${head} ${sh(from)}` : head]
    },
  },
  delete_tag: {
    titleKey: 'gitCommand.deleteTag',
    family: 'branch',
    render: (a) => [`git tag -d ${shOr(str(a, 'name'), '<tag>')}`],
  },
  merge_branch: {
    titleKey: 'gitCommand.merge',
    family: 'branch',
    // Two commands, because that is what runs: the target is checked out first, since a merge always
    // lands on the branch you are on.
    render: (a) => [
      `git checkout ${shOr(str(a, 'target'), '<target>')}`,
      `git merge --no-edit ${shOr(str(a, 'source'), '<source>')}`,
    ],
  },
  fast_forward_branch: {
    titleKey: 'gitCommand.fastForward',
    family: 'branch',
    render: (a) => [`git merge --ff-only ${shOr(str(a, 'source'), '<source>')}`],
  },

  // ─── Rewriting history ──────────────────────────────────────────────────────
  rebase_onto_commit: {
    titleKey: 'gitCommand.rebase',
    family: 'history',
    render: (a) => [`git rebase ${oidArg(a, 'targetOid')}`],
  },
  run_interactive_rebase: {
    titleKey: 'gitCommand.interactiveRebase',
    family: 'history',
    render: (a) => [`git rebase --interactive ${oidArg(a, 'baseOid')}`],
  },
  continue_rebase: {
    titleKey: 'gitCommand.rebaseContinue',
    family: 'history',
    render: () => ['git rebase --continue'],
  },
  skip_rebase: {
    titleKey: 'gitCommand.rebaseSkip',
    family: 'history',
    render: () => ['git rebase --skip'],
  },
  abort_rebase: {
    titleKey: 'gitCommand.rebaseAbort',
    family: 'history',
    render: () => ['git rebase --abort'],
  },
  bisect_start: {
    titleKey: 'gitCommand.bisectStart',
    family: 'history',
    render: (a) => [
      `git bisect start ${shOr(str(a, 'badRev'), '<bad>')} ${shOr(str(a, 'goodRev'), '<good>')}`,
    ],
  },
  bisect_mark: {
    titleKey: 'gitCommand.bisectMark',
    family: 'history',
    render: (a) => [`git bisect ${str(a, 'term') ?? '<good|bad>'}`],
  },
  bisect_reset: {
    titleKey: 'gitCommand.bisectReset',
    family: 'history',
    render: () => ['git bisect reset'],
  },
  apply_patch: {
    titleKey: 'gitCommand.applyPatch',
    family: 'history',
    render: (a) => [
      `git apply${flag(a, 'checkOnly') ? ' --check' : ''} -- ${shOr(str(a, 'patchPath'), '<patch>')}`,
    ],
  },

  // ─── Remotes ────────────────────────────────────────────────────────────────
  fetch_remote: {
    titleKey: 'gitCommand.fetch',
    family: 'remote',
    render: (a) => [`git fetch ${remote(a)}${flag(a, 'prune') ? ' --prune' : ''}`],
  },
  pull_branch: {
    titleKey: 'gitCommand.pull',
    family: 'remote',
    // `PullStrategy` serializes kebab-case (see `lib/tauri.ts`); its default —
    // `fast-forward-if-possible` — is plain `git pull`, so it adds no option.
    render: (a) => {
      const strategy = str(a, 'strategy')
      const option =
        strategy === 'rebase' ? ' --rebase' : strategy === 'fast-forward-only' ? ' --ff-only' : ''
      return [`git pull${option} ${remote(a)}`]
    },
  },
  push_branch: {
    titleKey: 'gitCommand.push',
    family: 'remote',
    render: (a) => [`git push${flag(a, 'force') ? ' --force' : ''} ${remote(a)}`],
  },
  push_branch_to: {
    titleKey: 'gitCommand.pushTo',
    family: 'remote',
    render: (a) => [
      `git push${flag(a, 'force') ? ' --force' : ''} ${remote(a)} ` +
        `${shOr(str(a, 'source'), '<source>')}:${shOr(str(a, 'target'), '<target>')}`,
    ],
  },
  push_tag: {
    titleKey: 'gitCommand.pushTag',
    family: 'remote',
    render: (a) => [`git push ${remote(a)} ${shOr(str(a, 'tagName'), '<tag>')}`],
  },
  delete_remote_tag: {
    titleKey: 'gitCommand.deleteRemoteTag',
    family: 'remote',
    render: (a) => [`git push ${remote(a)} :refs/tags/${str(a, 'tagName') ?? '<tag>'}`],
  },
  delete_remote_branch: {
    titleKey: 'gitCommand.deleteRemoteBranch',
    family: 'remote',
    render: (a) => [`git push ${remote(a)} :refs/heads/${str(a, 'branchName') ?? '<branch>'}`],
  },
  add_remote: {
    titleKey: 'gitCommand.addRemote',
    family: 'remote',
    render: (a) => [`git remote add ${shOr(str(a, 'name'), '<name>')} ${urlArg(a)}`],
  },
  remove_remote: {
    titleKey: 'gitCommand.removeRemote',
    family: 'remote',
    render: (a) => [`git remote remove ${shOr(str(a, 'name'), '<name>')}`],
  },

  // ─── Stash ──────────────────────────────────────────────────────────────────
  stash_push: {
    titleKey: 'gitCommand.stashPush',
    family: 'stash',
    render: (a) => {
      const message = str(a, 'message')
      return [
        `git stash push${flag(a, 'includeUntracked') ? ' --include-untracked' : ''}` +
          (message ? ` -m ${sh(firstLine(message))}` : ''),
      ]
    },
  },
  stash_pop: {
    titleKey: 'gitCommand.stashPop',
    family: 'stash',
    render: (a) => [`git stash pop ${stashRef(a)}`],
  },
  stash_apply: {
    titleKey: 'gitCommand.stashApply',
    family: 'stash',
    render: (a) => [`git stash apply ${stashRef(a)}`],
  },
  stash_drop: {
    titleKey: 'gitCommand.stashDrop',
    family: 'stash',
    render: (a) => [`git stash drop ${stashRef(a)}`],
  },
  stash_store: {
    titleKey: 'gitCommand.stashStore',
    family: 'stash',
    render: (a) => [`git stash store -m ${messageArg(a)} ${oidArg(a, 'commitOid')}`],
  },
  edit_stash_message: {
    titleKey: 'gitCommand.editStashMessage',
    family: 'stash',
    // Git has no "rename a stash": the entry is dropped and stored again under the new message, which
    // is exactly what the app does — so both lines are shown rather than inventing a single one.
    render: (a) => [
      `git stash drop ${stashRef(a)}`,
      `git stash store -m ${messageArg(a)} <dropped-commit>`,
    ],
  },

  // ─── Worktrees ──────────────────────────────────────────────────────────────
  add_worktree: {
    titleKey: 'gitCommand.addWorktree',
    family: 'worktree',
    render: (a) => [
      `git worktree add ${shOr(str(a, 'worktreePath'), '<path>')} ` +
        `${shOr(str(a, 'branch'), '<branch>')}`,
    ],
  },
  remove_worktree: {
    titleKey: 'gitCommand.removeWorktree',
    family: 'worktree',
    render: (a) => [
      `git worktree remove${flag(a, 'force') ? ' --force' : ''} ` +
        `${shOr(str(a, 'worktreePath'), '<path>')}`,
    ],
  },
  prune_worktrees: {
    titleKey: 'gitCommand.pruneWorktrees',
    family: 'worktree',
    render: () => ['git worktree prune'],
  },

  // ─── Conflicts ──────────────────────────────────────────────────────────────
  resolve_conflict: {
    titleKey: 'gitCommand.resolveConflict',
    family: 'conflict',
    // The merged content is written by the editor, which has no git equivalent; staging it is what
    // tells git the conflict is settled, and that is the part worth teaching.
    render: (a) => [`git add -- ${shOr(str(a, 'filePath'), '<file>')}`],
  },
  resolve_conflict_binary: {
    titleKey: 'gitCommand.resolveConflictSide',
    family: 'conflict',
    render: (a) => {
      const file = shOr(str(a, 'filePath'), '<file>')
      return [`git checkout --${str(a, 'side') ?? 'ours'} -- ${file}`, `git add -- ${file}`]
    },
  },

  // ─── Repository ─────────────────────────────────────────────────────────────
  clone_repo: {
    titleKey: 'gitCommand.clone',
    family: 'repo',
    render: (a) => [
      'git clone' +
        (flag(a, 'shallow') ? ' --depth 1' : '') +
        (flag(a, 'sparse') ? ' --sparse' : '') +
        ` ${urlArg(a)}` +
        ` ${shOr(str(a, 'destPath'), '<directory>')}`,
    ],
  },
  init_repo: {
    titleKey: 'gitCommand.init',
    family: 'repo',
    render: (a) => [`git init ${shOr(str(a, 'path'), '<directory>')}`],
  },
}

/** One backend operation, described as the git command it stands for. */
export interface DescribedGitCommand {
  titleKey: string
  family: GitCommandFamily
  /** The git command line(s) the operation ran, in execution order. */
  lines: string[]
}

/** Whether this IPC command is one of the repository-changing operations the catalog covers — the
 * test that separates a user's actions from the reads the app performs continuously. */
export function isGitCommandOperation(command: string): boolean {
  return command in CATALOG
}

/**
 * Describes one recorded operation, or `null` when it is not a catalogued action.
 *
 * `args` is whatever the activity log holds: an object in the normal case, but a string
 * (`'[redacted]'`) for auth-shaped commands and `undefined` for no-argument ones. Anything that is
 * not an object renders from an empty bag, so a redacted call still yields its command shape.
 */
export function describeGitCommand(command: string, args: unknown): DescribedGitCommand | null {
  const spec = CATALOG[command]
  if (!spec) return null
  const bag: RecordedArgs =
    args !== null && typeof args === 'object' && !Array.isArray(args) ? (args as RecordedArgs) : {}
  return { titleKey: spec.titleKey, family: spec.family, lines: spec.render(bag) }
}
