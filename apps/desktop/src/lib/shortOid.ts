/**
 * Truncates a commit SHA-1 (or any oid-shaped string) to its short, `git log --oneline`-style form:
 * the first 7 characters, or the whole string when it is already 7 characters or fewer. Mirrors the
 * Rust `utils::short_oid()` used throughout the backend — every frontend call site should go through
 * this helper instead of hand-rolling `.slice(0, 7)` / `.substring(0, 7)`.
 */
export function shortOid(oid: string): string {
  return oid.slice(0, 7)
}
