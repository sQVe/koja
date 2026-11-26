import type { Pull } from '../../data/pulls.ts';

export type RowCut = 'middle' | 'end';

export const showsTitle = (title: string | null): title is string => title !== null && title !== '';

const showsOwnTitle = (named: boolean, pull: Pull | null, ticketTitle: string | null): boolean => {
  if (named) {
    return false;
  }

  return showsTitle(ticketTitle) || showsTitle(pull?.title ?? null);
};

export const rowCut = (named: boolean, pull: Pull | null, ticketTitle: string | null): RowCut =>
  showsOwnTitle(named, pull, ticketTitle) ? 'end' : 'middle';

export const rowTitleOf = (
  named: boolean,
  spaceName: string,
  pull: Pull | null,
  ticketTitle: string | null,
): string => {
  if (named) {
    return spaceName;
  }

  if (showsTitle(ticketTitle)) {
    return ticketTitle;
  }

  if (pull !== null && showsTitle(pull.title)) {
    return pull.title;
  }

  return spaceName;
};
