# Spec — Commit graph column layout

**Status:** live specification. Unlike everything under [`archive/`](./archive/README.md), this
document describes the code as it is today and is meant to be kept in sync with it.

**Scope:** how the commit graph decides which horizontal lane (column) each row is drawn on, and
which lanes are dashed. Written after a recurring class of bug where the graph "looked broken" —
the top of the history pushed to the right, with a long, commit-less line hugging the left edge.

**Code:**

| Layer                                                                                                   | Responsibility                                                                           |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`services/git_graph.rs`](../../apps/desktop/src-tauri/src/services/git_graph.rs) — `build_graph_nodes` | Assigns every commit a column, a color and its connection segments                       |
| [`hooks/useGitGraphNodes.ts`](../../apps/desktop/src/hooks/useGitGraphNodes.ts)                         | Splices in the synthetic rows (WIP, paused rebase, per-worktree WIP) and the dashed runs |
| [`components/git-graph/GraphSvg.tsx`](../../apps/desktop/src/components/git-graph/GraphSvg.tsx)         | Draws the segments; it trusts the flags it is given and infers nothing                   |

---

## 1. The invariant: the graph is laid out top-to-bottom

**The first displayed element owns column 0. Every other lane is placed relative to it, in the
order lanes first appear going down.**

That is the whole rule. The graph is read the way it is rendered — newest at the top, oldest at the
bottom — so the element at the top is the origin of the layout, and nothing below it may reach back
up and claim the leftmost lane.

Concretely, in `build_graph_nodes`:

- `active_lanes` starts **empty**.
- Each commit, taken in display order, is placed on the lane already waiting for it; if none is
  waiting, it takes the leftmost free lane (`is_new_lane`). The first commit therefore always
  lands on column 0.
- A commit's first parent inherits its column; additional parents (a merge) take the leftmost free
  lane to the right.

### What this forbids

**No lane may ever be reserved from a ref.** Not from the checked-out branch, not from
`main`/`master`, not from `origin/main`. Seeding `active_lanes` before the walk means reserving
column 0 for a commit that may be far below the top of the page, which produces exactly the broken
render this spec exists to prevent:

- every row above that commit carries a bare pass-through segment on column 0 — a line with no
  commit on it, running down the left edge;
- the real topmost commit is pushed to column 1 (or further), and so is everything hanging off it;
- the top row hides its own incoming segment (`isFirst` in `GraphSvg`), so the reserved line looks
  "cut" — it starts in mid-air a row below the top.

This has been re-introduced three times under different names, each time as a well-meaning "the
mainline should be on the left" tweak:

| Attempt                                                              | Symptom                                                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Seed column 0 from the checked-out branch's tip                      | A cut lane above the tip whenever that branch was merged or behind                        |
| Same, via a first-parent-only ancestry check                         | Same bug, missed when the tip was a merge's **second** parent                             |
| Seed column 0 from `refs/heads/main` (or `refs/remotes/origin/main`) | On `main`, any branch with newer commits pushed the whole top of the graph one lane right |

The intuition behind all three ("main is the backbone, it belongs on the left") is not wrong as an
aesthetic — it is wrong as a _layout rule_, because a lane is a rendering of a line between two
rows, and a line to a commit that is not displayed yet has nothing to connect to.

If the mainline should be leftmost, that is a property of **what is displayed**, not of the column
assignment: the top row _is_ the mainline whenever the mainline holds the newest commit.

### The one legitimate exception

`build_graph_nodes` seeds exactly one lane, and only when the caller passes `head_has_wip = true`
in the full-graph view (`branch` is `None`):

```
head_has_wip  ⇒  active_lanes[0] = HEAD's tip
```

This is not an exception to the rule, it is the rule applied honestly. When the working tree is
dirty (or a rebase is paused), the frontend splices a synthetic row **above the first commit** —
the `// WIP` / `en pause` row (`useGitGraphNodes`, `buildWipNode` / `buildConflictNode`). _That row_
is then the graph's first displayed element, it sits on column 0, and the seeded lane is simply its
connector running down to HEAD's tip. The reservation is legitimate precisely because a first row
exists to anchor it.

`head_has_wip` comes from the same status that decides whether the row is rendered at all
(`GitGraph.tsx`: `isRebasePaused || totalChanges > 0`). **Those two must never diverge** — a seed
without its row is the phantom lane again.

The single-branch view (`branch` is `Some`) is skipped: the walked branch's tip is the first commit,
so it owns column 0 on its own.

---

## 2. Colors are independent of columns

Do not conflate the two. `build_graph_nodes` pre-populates `color_map` by walking the first-parent
chains of `main`/`master` (blue `#2563eb`) and `origin/main`/`origin/master` (purple `#7c3aed`)
whenever the checked-out branch is main/master, so the mainline reads consistently regardless of
which lane it lands on. Every other commit takes the next color from `COLORS`, fixed once and
propagated to its first parent so a lane keeps one color along its length.

Coloring main blue is fine. Reserving a _column_ for main is not. Keep the fix on the color side.

---

## 3. Dashed segments

Three unrelated things render dashed; each is owned by exactly one layer.

| Dashing                       | Owner                              | Meaning                                                      |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| Stash bridge                  | Rust (`build_graph_nodes`)         | The link from a stash to its base commit is not real history |
| WIP / paused-rebase connector | `useGitGraphNodes` (`renderNodes`) | The synthetic row's link down to the commit it is based on   |
| Above `origin/main`           | `useGitGraphNodes` (`renderNodes`) | Local commits not yet pushed                                 |

The unpushed dashing follows **`origin/main`'s own column**, read off its node
(`originMainColumn`) — never a hardcoded `0`. Under top-to-bottom assignment, column 0 belongs to
whichever lane the topmost row starts; it is the mainline only by coincidence. Rust used to inject
this dashing itself on column 0 and no longer does: that block encoded the same false assumption and
was dead in practice.

One segment stays solid inside the dashed run: `origin/main`'s **own** downward departure
(`startsAtNode` at `originMainIndex`), which leads into already-pushed history — that is what makes
the dashed→solid transition land exactly on the `origin/main` node instead of half a row below it.

---

## 4. Working on this code

**Before changing the column assignment, ask: does the change make a row's lane depend on something
below it?** If yes, it is the bug. The only inputs to a row's column are the lanes left open by the
rows above it.

The invariant is locked by the Rust unit tests at the bottom of `git_graph.rs`:

| Test                                                     | Locks                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `main_checkout_does_not_reserve_column_zero_for_its_tip` | On `main`, a newer feature branch keeps column 0; with a WIP row, HEAD does |
| `merged_checked_out_tip_does_not_reserve_column_zero`    | A merged/behind checked-out tip claims nothing                              |
| `second_parent_merged_tip_follows_top_down_order`        | Same, when the tip is a merge's second parent                               |
| `checked_out_branch_tip_owns_column_zero_in_full_graph`  | The WIP seed, and its absence on a clean tree                               |
| `merge_row_ahead_of_origin_stays_solid_in_rust`          | Rust adds no "unpushed" dashing of its own                                  |

and on the frontend by `useGitGraphNodes.test.ts` — in particular
`dashes origin/main's own lane, not column 0, when the mainline isn't leftmost`.

Run them with:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib git_graph
```

To eyeball the result against real, awkward repositories rather than fixtures, use
`pnpm dev:import-repo` (see [`tools/git-fixtures/README.md`](../../tools/git-fixtures/README.md)).
