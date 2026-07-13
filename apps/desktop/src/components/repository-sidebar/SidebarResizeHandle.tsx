interface SidebarResizeHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}

export function SidebarResizeHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: SidebarResizeHandleProps) {
  return (
    <div
      className="group/handle absolute right-0 top-0 z-30 flex h-full w-[5px] cursor-col-resize touch-none select-none items-center justify-center"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-hidden
    >
      {/* Barre visuelle */}
      <div className="h-full w-px bg-sidebar-border transition-colors group-hover/handle:w-[2px] group-hover/handle:bg-primary/60 group-active/handle:w-[2px] group-active/handle:bg-primary" />
    </div>
  )
}
