import { useEffect, useState } from 'preact/hooks';
import type { Ms } from '../core/types';
import { emptyData, normalize, refreshIfStale, type AppData } from './model';

const KEY = 'planner-data-v1';

function load(): AppData {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyData();
  try {
    return normalize(JSON.parse(raw));
  } catch {
    // Keep the unreadable copy instead of silently overwriting it.
    localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
    return emptyData();
  }
}

let state: AppData = refreshIfStale(load(), Date.now());
const subs = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    alert('Could not save. Export a backup from Settings now.');
  }
}
save();

export function commit(fn: (d: AppData, now: Ms) => AppData) {
  const next = fn(state, Date.now());
  if (next === state) return;
  state = next;
  save();
  subs.forEach((f) => f());
}

export function useData(): AppData {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return state;
}

/** Current time, refreshed every 30 s and whenever the app comes back to the foreground. */
export function useNow(): Ms {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      commit((d, t) => refreshIfStale(d, t));
    };
    const id = setInterval(tick, 30_000);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return now;
}
