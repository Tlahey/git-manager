#!/usr/bin/env bash
# Reports per-file line/function/branch coverage for specific Rust source files in
# apps/desktop/src-tauri, with the exact uncovered line numbers so tests can be targeted.
#
# Usage: check_rust_coverage.sh <path/to/file.rs> [<path/to/file2.rs> ...]
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: check_rust_coverage.sh <path/to/file.rs> [...]" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
TAURI_DIR="$REPO_ROOT/apps/desktop/src-tauri"

if ! cargo llvm-cov --version >/dev/null 2>&1; then
  echo "error: cargo-llvm-cov not installed — run scripts/setup_coverage_tooling.sh first." >&2
  exit 1
fi

BRANCH_FLAG=""
CARGO_BIN="cargo"
if rustup toolchain list 2>/dev/null | grep -q '^nightly'; then
  CARGO_BIN="cargo +nightly"
  BRANCH_FLAG="--branch"
else
  echo "note: nightly toolchain not installed — branch coverage will be reported as unavailable."
  echo "      (run 'rustup toolchain install nightly' for branch numbers; see rust-test-patterns.md)"
  echo
fi

LCOV_PATH="$TAURI_DIR/target/llvm-cov-target/lcov.info"
mkdir -p "$(dirname "$LCOV_PATH")"

echo "Running cargo llvm-cov (this recompiles with instrumentation, may take a moment)..."
# --lib restricts this to the library target's own test binary. Without it, cargo-llvm-cov also
# instruments src/main.rs's (test-less) binary target, which links the same lib code and reports
# every pub fn a second time with 0 hits from that binary's perspective — silently halving
# function-coverage percentages for functions that are, in reality, fully exercised by the lib's
# own #[cfg(test)] modules.
(cd "$TAURI_DIR" && eval "$CARGO_BIN llvm-cov --lib $BRANCH_FLAG --lcov --output-path '$LCOV_PATH'")

python3 - "$LCOV_PATH" "$REPO_ROOT" "$@" <<'PYEOF'
import sys

lcov_path, repo_root, *targets = sys.argv[1:]
THRESHOLD = 95.0

with open(lcov_path) as f:
    content = f.read()

records = {}
current_file = None
buf = None
for line in content.splitlines():
    if line.startswith("SF:"):
        current_file = line[3:]
        buf = {"lines": {}, "branches": {}, "funcs": {}, "func_lines": {}}
    elif line.startswith("DA:") and buf is not None:
        parts = line[3:].split(",")
        ln, hits = int(parts[0]), int(parts[1])
        buf["lines"][ln] = hits
    elif line.startswith("BRDA:") and buf is not None:
        parts = line[5:].split(",")
        ln, hits = int(parts[0]), parts[3]
        covered = hits not in ("-", "0")
        buf["branches"].setdefault(ln, []).append(covered)
    elif line.startswith("FN:") and buf is not None:
        parts = line[3:].split(",", 1)
        fn_line, name = int(parts[0]), parts[1]
        buf["func_lines"][name] = fn_line
    elif line.startswith("FNDA:") and buf is not None:
        parts = line[5:].split(",", 1)
        hits, name = int(parts[0]), parts[1]
        buf["funcs"][name] = hits
    elif line == "end_of_record" and current_file is not None:
        records[current_file] = buf
        current_file = None
        buf = None

def compress_ranges(nums):
    nums = sorted(nums)
    if not nums:
        return "(none)"
    ranges = []
    start = prev = nums[0]
    for n in nums[1:]:
        if n == prev + 1:
            prev = n
            continue
        ranges.append(f"{start}-{prev}" if start != prev else str(start))
        start = prev = n
    ranges.append(f"{start}-{prev}" if start != prev else str(start))
    return ",".join(ranges)

all_pass = True
had_branch_data = any(r["branches"] for r in records.values())

for target in targets:
    match_key = None
    for key in records:
        if key.endswith(target) or key.endswith("/" + target):
            match_key = key
            break
    print(target)
    if match_key is None:
        print("  (no coverage data — file may not be part of the compiled/tested crate, or has no #[cfg(test)] module yet)")
        all_pass = False
        print()
        continue

    rec = records[match_key]

    total_lines = len(rec["lines"])
    covered_lines = sum(1 for h in rec["lines"].values() if h > 0)
    line_pct = (covered_lines / total_lines * 100) if total_lines else 100.0
    uncovered_lines = [ln for ln, h in rec["lines"].items() if h == 0]

    total_funcs = len(rec["funcs"])
    covered_funcs = sum(1 for h in rec["funcs"].values() if h > 0)
    func_pct = (covered_funcs / total_funcs * 100) if total_funcs else 100.0
    # FN/FNDA carry LLVM's mangled symbol name, not the source identifier — report by
    # declaration line instead, consistent with the lines/branches output and actually readable.
    uncovered_func_lines = [
        rec["func_lines"][name] for name, h in rec["funcs"].items() if h == 0 and name in rec["func_lines"]
    ]

    def status(pct):
        return "OK  " if pct >= THRESHOLD else "FAIL"

    if line_pct < THRESHOLD or func_pct < THRESHOLD:
        all_pass = False
    print(f"  {status(line_pct)}  lines      {line_pct:.2f}%")
    print(f"  {status(func_pct)}  functions  {func_pct:.2f}%")

    if had_branch_data:
        total_branches = len(rec["branches"])
        covered_branches = sum(1 for outcomes in rec["branches"].values() if any(outcomes))
        branch_pct = (covered_branches / total_branches * 100) if total_branches else 100.0
        uncovered_branch_lines = [ln for ln, outcomes in rec["branches"].items() if not any(outcomes)]
        if branch_pct < THRESHOLD:
            all_pass = False
        print(f"  {status(branch_pct)}  branches   {branch_pct:.2f}%")
        if uncovered_branch_lines:
            print(f"  uncovered branch lines: {compress_ranges(uncovered_branch_lines)}")
    else:
        print("  n/a   branches   (nightly toolchain not installed)")

    if uncovered_lines:
        print(f"  uncovered line #s: {compress_ranges(uncovered_lines)}")
    if uncovered_func_lines:
        print(f"  uncovered functions starting at line #s: {compress_ranges(uncovered_func_lines)}")
    print()

if not all_pass:
    print(f"Below {THRESHOLD}% on at least one metric for at least one file — add tests targeting the uncovered lines/branches/functions above and rerun.")
    sys.exit(1)
print(f"All files at or above {THRESHOLD}%.")
PYEOF
