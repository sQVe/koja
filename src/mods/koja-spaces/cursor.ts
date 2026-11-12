import type { ListAction } from '../../kit/section.ts';

export interface CursorMove {
  shown: readonly string[];
  cursor: string | null;
  active: string | null;
  action: ListAction;
  halfPage: number;
}

export interface CursorResult {
  cursor: string | null;
  select: string | null;
}

const startIndex = (
  shown: readonly string[],
  cursor: string | null,
  active: string | null,
): number => {
  const candidates = [cursor, active].map((id) => (id === null ? -1 : shown.indexOf(id)));

  return candidates.find((index) => index >= 0) ?? 0;
};

export const cursorRow = (
  shown: readonly string[],
  cursor: string | null,
  active: string | null,
): string | null => shown[startIndex(shown, cursor, active)] ?? null;

const destination = (index: number, move: CursorMove): number => {
  const last = move.shown.length - 1;

  const offsets: Record<ListAction, number> = {
    down: 1,
    up: -1,
    first: -last,
    last,
    halfPageDown: move.halfPage,
    halfPageUp: -move.halfPage,
    open: 0,
  };

  return Math.min(last, Math.max(0, index + offsets[move.action]));
};

export const moveCursor = (move: CursorMove): CursorResult => {
  const start = startIndex(move.shown, move.cursor, move.active);
  const cursor = move.shown[destination(start, move)] ?? null;

  return { cursor, select: move.action === 'open' ? cursor : null };
};

export const halfPageOf = (height: number, rowHeight: number): number =>
  Math.max(1, Math.floor(height / rowHeight / 2));
