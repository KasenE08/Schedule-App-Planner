// Small stroke icons (24-unit grid, 1.8 stroke), drawn inline so they work offline.
import type { BlockTag } from '../core/types';

const PATHS: Record<string, string> = {
  calendar: 'M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z',
  tasks: 'M8 12l3 3 5-6M7 4h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3z',
  plus: 'M12 5v14M5 12h14',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 110 4 2 2 0 010-4zM9 15a2 2 0 110 4 2 2 0 010-4z',
  close: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 7v5l3 2M12 3a9 9 0 110 18 9 9 0 010-18z',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  play: 'M8 5l11 7-11 7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  book: 'M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5zM5 19.5A1.5 1.5 0 006.5 21H19',
  dumbbell: 'M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11',
  briefcase: 'M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7M5 7h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2zM3 13h18',
  cap: 'M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5V16c1.5 1.5 3.5 2.5 5.5 2.5s4-1 5.5-2.5v-4.5',
  target: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 7.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM12 11.5a.5.5 0 110 1 .5.5 0 010-1z',
  basket: 'M3.5 9.5h17l-2 10h-13zM8.5 9.5L12 4l3.5 5.5',
  monitor: 'M5 4.5h14a2 2 0 012 2V15a2 2 0 01-2 2H5a2 2 0 01-2-2V6.5a2 2 0 012-2zM8.5 20.5h7M12 17v3.5',
  file: 'M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  bell: 'M6 9a6 6 0 0112 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2 2 0 004 0',
  chevronLeft: 'M14.5 18l-6-6 6-6',
  chevronRight: 'M9.5 6l6 6-6 6',
  moon: 'M19.5 14.5A7.5 7.5 0 019.5 4.5a8 8 0 1010 10z',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z',
  edit: 'M4 20h4L19.5 8.5l-4-4L4 16z',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.5h.01',
  sparkle: 'M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Icon and pastel tint for each kind of fixed time. */
export const TAG_STYLE: Record<BlockTag, { icon: IconName; color: string }> = {
  school: { icon: 'book', color: 'var(--blue)' },
  work: { icon: 'briefcase', color: 'var(--peach)' },
  gym: { icon: 'dumbbell', color: 'var(--mint)' },
  tutoring: { icon: 'cap', color: 'var(--lavender)' },
  activity: { icon: 'target', color: 'var(--pink)' },
  chore: { icon: 'basket', color: 'var(--gray)' },
  other: { icon: 'calendar', color: 'var(--periwinkle)' },
};

/** Icon for each assignment category (same order as CATEGORIES). */
export const CATEGORY_ICONS: IconName[] = ['monitor', 'monitor', 'file', 'file', 'list'];
