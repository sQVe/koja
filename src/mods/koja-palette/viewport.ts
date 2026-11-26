import { rowHeight, spacing } from '../../kit/size.ts';

export interface RowPlace {
  head: boolean;
  title: number;
  row: number;
}

export const shownRows = 12;

export const rowSize = rowHeight.medium;

export const headSize = rowHeight.small;

export const groupSpace = spacing.small;

export const listHeight = shownRows * rowSize;

export const placesOf = (headKeys: readonly string[], grouped: boolean): RowPlace[] => {
  const places: RowPlace[] = [];
  let top = 0;
  let heads = 0;

  for (const [index, headKey] of headKeys.entries()) {
    const opensGroup = index === 0 || headKey !== headKeys[index - 1];
    const head = grouped && opensGroup;
    const space = head && heads > 0 ? groupSpace : 0;
    const headHeight = head ? headSize : 0;

    places.push({ head, title: top + space, row: top + space + headHeight });
    top += space + headHeight + rowSize;
    heads += head ? 1 : 0;
  }

  return places;
};

export const totalHeight = (places: readonly RowPlace[]): number =>
  places.length === 0 ? 0 : rowSize + (places.at(-1)?.row ?? 0);

export const maxScroll = (places: readonly RowPlace[]): number =>
  Math.max(0, totalHeight(places) - listHeight);

export const clampIndex = (index: number, count: number): number =>
  Math.min(index, Math.max(0, count - 1));

export const rowAt = <T>(rows: readonly T[], at: number): T | undefined =>
  rows[clampIndex(at, rows.length)];

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

export const wheel = (
  places: readonly RowPlace[],
  at: number,
  scroll: number,
  max: number,
  delta: number,
): { scroll: number; at: number } => {
  const next = Math.max(0, Math.min(scroll - delta, max));
  let nextAt = at;

  while (nextAt < places.length - 1 && (places[nextAt]?.row ?? 0) < next) {
    nextAt += 1;
  }

  while (nextAt > 0 && (places[nextAt]?.row ?? 0) + rowSize > next + listHeight) {
    nextAt -= 1;
  }

  return { scroll: next, at: nextAt };
};

export const visible = (start: number, end: number, scroll: number): boolean =>
  end > scroll && start < scroll + listHeight;

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
