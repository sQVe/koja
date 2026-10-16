import type { PaneScrollCommand } from '../client/client.ts';
import { paneId } from '../ids.ts';
import { parseClientId } from './clientCommandParse.ts';
import { parseId } from './idParse.ts';

const parseScrollTarget = (value: string): PaneScrollCommand['to'] | undefined => {
  if (value === 'top' || value === 'bottom') {
    return value;
  }

  const row = Number(value);

  return /^[0-9]+$/.test(value) && Number.isSafeInteger(row) ? row : undefined;
};

export const parsePaneScroll = (
  rest: string[],
  pane: string | undefined,
  to: string | undefined,
  client: string | undefined,
): PaneScrollCommand | string => {
  if (pane !== undefined) {
    return '--pane belongs to pane send. pane scroll takes the pane id as an argument.';
  }

  if (rest.length !== 1) {
    return 'pane scroll takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  if (to === undefined) {
    return 'pane scroll takes --to top, bottom, or a row number.';
  }

  const position = parseScrollTarget(to);

  if (position === undefined) {
    return `'${to}' is not a scroll position. Use top, bottom, or a row number of 0 or more.`;
  }

  const owner = parseClientId(client);

  return owner.ok
    ? { action: 'scroll', pane: paneId(target), to: position, client: owner.id }
    : owner.message;
};
