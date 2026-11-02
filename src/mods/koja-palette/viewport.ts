import { controlSize, rowHeight } from '../../kit/size.ts';

// Where a row, and the group title before it, sit in the list's strip, in pixels.
export interface RowPlace {
  head: boolean;
  title: number;
  row: number;
}

// The list keeps one height while you move: rows and group titles have fixed heights, and the
// list shows as many as fit in this many rows.
export const shownRows = 12;

export const rowSize = rowHeight.large;

export const headSize = controlSize.sectionHeader;

export const listHeight = shownRows * rowSize;

export const placesOf = (headKeys: readonly string[], grouped: boolean): RowPlace[] => {
  const places: RowPlace[] = [];
  let top = 0;

  for (const [index, headKey] of headKeys.entries()) {
    const opensGroup = index === 0 || headKey !== headKeys[index - 1];
    const head = grouped && opensGroup;
    const headHeight = head ? headSize : 0;

    places.push({ head, title: top, row: top + headHeight });
    top += headHeight + rowSize;
  }

  return places;
};

export const totalHeight = (places: readonly RowPlace[]): number =>
  places.length === 0 ? 0 : rowSize + (places.at(-1)?.row ?? 0);

export const maxScroll = (places: readonly RowPlace[]): number =>
  Math.max(0, totalHeight(places) - listHeight);

export const clampIndex = (index: number, count: number): number =>
  Math.min(index, Math.max(0, count - 1));

// The row at `at`, or the last row when a shrinking list left the index past the end.
export const rowAt = <T>(rows: readonly T[], at: number): T | undefined =>
  rows[clampIndex(at, rows.length)];

// Scrolls only as far as it takes to keep the selected row, and the group title it opens, in view.
export const scrollToShow = (
  places: readonly RowPlace[],
  at: number,
  scroll: number,
  max: number,
): number => {
  const selected = places[at];
  let next = scroll;

  if (selected !== undefined) {
    const from = selected.head ? selected.title : selected.row;

    if (from < next) {
      next = from;
    }

    if (selected.row + rowSize > next + listHeight) {
      next = selected.row + rowSize - listHeight;
    }
  }

  return Math.max(0, Math.min(next, max));
};

// `delta` is the pixels the device reported, whatever unit it used.
export const wheel = (
  places: readonly RowPlace[],
  at: number,
  scroll: number,
  max: number,
  delta: number,
): { scroll: number; at: number } => {
  const next = Math.max(0, Math.min(scroll - delta, max));
  let nextAt = at;

  // The selection stays on screen, so the next frame doesn't scroll back to it.
  while (nextAt < places.length - 1 && (places[nextAt]?.row ?? 0) < next) {
    nextAt += 1;
  }

  while (nextAt > 0 && (places[nextAt]?.row ?? 0) + rowSize > next + listHeight) {
    nextAt -= 1;
  }

  return { scroll: next, at: nextAt };
};

export const visible = (start: number, end: number, scroll: number, scrolls: boolean): boolean => {
  if (!scrolls) {
    return true;
  }

  return end > scroll && start < scroll + listHeight;
};

// The wheel starts from the displayed scroll, not from one left by an earlier, longer list.
export const wheelFrom = (
  places: readonly RowPlace[],
  at: number,
  scroll: number,
  max: number,
  delta: number,
): { scroll: number; at: number } => {
  const index = clampIndex(at, places.length);
  const from = scrollToShow(places, index, scroll, max);

  return wheel(places, index, from, max, delta);
};
