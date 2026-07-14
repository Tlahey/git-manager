/** Custom branch-merge glyph for the "apply all non-conflicting" toolbar button — a horizontal
 * incoming arrow feeding into a downward-merging branch curve. Kept as a local SVG rather than a
 * lucide icon because there's no close enough match in the set. */
export function CombinedMergeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Horizontal line with left arrow */}
      <path d="M12 5H4M7 2L4 5l3 3" />
      {/* Branch curve merging downward */}
      <path d="M4 11h5a3 3 0 0 0 3-3V7" />
      <path d="m10 9 2 2-2 2" />
    </svg>
  )
}
