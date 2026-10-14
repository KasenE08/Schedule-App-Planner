import { useEffect, useRef, useState } from 'preact/hooks';

export type DropTarget = { day: string } | { task: string };

interface Drag {
  id: string;
  title: string;
  x: number;
  y: number;
  over: DropTarget | null;
}

const HOLD_MS = 450;
const MOVE_TOLERANCE = 8;

function targetAt(x: number, y: number, self: string): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day],[data-drop-task]');
  if (!el) return null;
  if (el.dataset.dropDay) return { day: el.dataset.dropDay };
  if (el.dataset.dropTask && el.dataset.dropTask !== self) return { task: el.dataset.dropTask };
  return null;
}

/**
 * Press and hold an item, then drag it onto a day in the week strip or onto another item.
 * Moving before the hold completes is treated as a normal scroll.
 */
export function useDrag(onDrop: (id: string, target: DropTarget) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  /** Pointer of the press in progress; any other finger or touch is ignored until it ends. */
  const activePointer = useRef<number | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  // While dragging, stop the page from scrolling under the finger and auto-scroll near the edges.
  useEffect(() => {
    if (!drag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    let raf = 0;
    const tick = () => {
      const d = live.current;
      if (d) {
        if (d.y > innerHeight - 110) scrollBy(0, 8);
        else if (d.y < 170 && !(d.over && 'day' in d.over)) scrollBy(0, -8);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('touchmove', block);
      cancelAnimationFrame(raf);
    };
  }, [!!drag]);

  const bind = (id: string, title: string) => ({
    onPointerDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest('button')) return;
      // Only one drag at a time, from the first finger: a second touch can't grab another assignment.
      if (!e.isPrimary || activePointer.current !== null) return;
      const pid = e.pointerId;
      activePointer.current = pid;
      const sx = e.clientX;
      const sy = e.clientY;
      let x = sx;
      let y = sy;
      const timer = setTimeout(() => {
        live.current = { id, title, x, y, over: null };
        setDrag(live.current);
      }, HOLD_MS);
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        x = ev.clientX;
        y = ev.clientY;
        if (!live.current) {
          if (Math.hypot(x - sx, y - sy) > MOVE_TOLERANCE) end();
          return;
        }
        live.current = { ...live.current, x, y, over: targetAt(x, y, id) };
        setDrag(live.current);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const d = live.current;
        end();
        if (d) {
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 400);
          if (d.over) dropRef.current(d.id, d.over);
        }
      };
      const end = () => {
        clearTimeout(timer);
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', cancel);
        live.current = null;
        activePointer.current = null;
        setDrag(null);
      };
      const cancel = (ev: PointerEvent) => ev.pointerId === pid && end();
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', cancel);
    },
    onContextMenu(e: Event) {
      e.preventDefault();
    },
    /** Wrap the item's tap handler so a finished drag doesn't also count as a tap. */
    guard(fn: () => void) {
      return () => {
        if (!suppressClick.current) fn();
      };
    },
  });

  const isOver = (t: DropTarget) =>
    !!drag?.over && ('day' in t ? 'day' in drag.over && drag.over.day === t.day : 'task' in drag.over && drag.over.task === t.task);

  const ghost = drag && (
    <div class="drag-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }}>
      {drag.title}
    </div>
  );

  return { drag, bind, isOver, ghost };
}
