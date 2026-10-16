import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { FixedBlock, Task } from '../core/types';
import { Icon } from './icons';

export type Sheet =
  | { kind: 'task'; task?: Task }
  | { kind: 'detail'; id: string }
  | { kind: 'block'; block?: FixedBlock; once?: boolean }
  | { kind: 'notifyGuide' };

export const UI = createContext<{ open: (s: Sheet) => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useUI = () => useContext(UI);

export function SheetFrame(p: {
  title: string;
  onSave?: () => void;
  saveLabel?: string;
  children: ComponentChildren;
}) {
  const { close } = useUI();
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet" role="dialog" aria-label={p.title}>
        <div class="sheet-grabber" />
        <header class="sheet-head">
          <button class="icon-btn" aria-label={p.onSave ? 'Cancel' : 'Close'} onClick={close}>
            <Icon name="close" />
          </button>
          <h2>{p.title}</h2>
          <span />
        </header>
        <div class="sheet-body">{p.children}</div>
        {p.onSave && (
          <footer class="sheet-foot">
            <button class="btn primary wide" onClick={p.onSave}>
              {p.saveLabel ?? 'Save'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

export function Field(p: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span class="field-label">{p.label}</span>
      {p.children}
      {p.hint && <span class="hint">{p.hint}</span>}
    </label>
  );
}

export function Chips<T extends string | number>(p: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div class="chips">
      {p.options.map((o) => (
        <button
          type="button"
          class={`chip ${p.selected.includes(o.value) ? 'on' : ''}`}
          onClick={() => p.onToggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
