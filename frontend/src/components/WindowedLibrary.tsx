import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { ImageRecord } from "../api";

/** Window the DOM while keeping the document's complete scroll extent. */
export default function WindowedLibrary({ items, view, className, frozen, render }: {
  items: ImageRecord[]; view: string; className: string; frozen: boolean;
  render: (item: ImageRecord) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, height: 240, gap: 16, start: 0, end: 12 });
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      if (!root.current || !grid.current || frozen) return;
      const css = getComputedStyle(grid.current);
      const columns = Math.max(1, css.gridTemplateColumns.split(" ").filter(Boolean).length);
      const first = grid.current.firstElementChild as HTMLElement | null;
      const height = first?.getBoundingClientRect().height || layout.height;
      const gap = parseFloat(css.rowGap) || 0;
      const rows = Math.ceil(items.length / columns);
      const top = root.current.getBoundingClientRect().top;
      const visibleRows = Math.ceil(window.innerHeight / (height + gap)) + 6;
      const start = Math.max(0, Math.min(rows - visibleRows, Math.floor(-top / (height + gap)) - 3));
      const end = Math.min(rows, start + visibleRows);
      setLayout(old => old.columns === columns && old.height === height && old.gap === gap && old.start === start && old.end === end
        ? old : { columns, height, gap, start, end });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (root.current) observer.observe(root.current);
    if (grid.current) observer.observe(grid.current);
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [items.length, view, frozen, layout.height]);
  const small = items.length <= 40;
  const start = small ? 0 : layout.start * layout.columns;
  const end = small ? items.length : Math.max(start + layout.columns, layout.end * layout.columns);
  const total = Math.ceil(items.length / layout.columns);
  return <div ref={root} data-testid="library-items" data-view={view}
    style={small ? undefined : { position: "relative", height: Math.max(0, total * (layout.height + layout.gap) - layout.gap) }}>
    <div ref={grid} className={className}
      style={small ? undefined : { position: "absolute", top: layout.start * (layout.height + layout.gap), width: "100%" }}>
      {items.slice(start, end).map(item => <div key={item.id} style={{ minWidth: 0 }}>{render(item)}</div>)}
    </div>
  </div>;
}
