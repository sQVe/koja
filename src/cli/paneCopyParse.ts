import type { PaneCopyCommand } from '../client/client.ts';
import { paneId } from '../ids.ts';
import { parseId } from './idParse.ts';

type Position = PaneCopyCommand['start'];

const parseWhole = (value: string): number | undefined => {
  const number = Number(value);

  return /^[0-9]+$/.test(value) && Number.isSafeInteger(number) ? number : undefined;
};

const parsePosition = (value: string): Position | undefined => {
  const parts = value.split(':');

  if (parts.length !== 2) {
    return undefined;
  }

  const row = parseWhole(parts[0] ?? '');
  const column = parseWhole(parts[1] ?? '');

  return row === undefined || column === undefined ? undefined : { row, column };
};

const startsAfter = (start: Position, end: Position): boolean => {
  if (start.row !== end.row) {
    return start.row > end.row;
  }

  return start.column > end.column;
};

export const parsePaneCopy = (
  rest: string[],
  from: string | undefined,
  to: string | undefined,
  print: boolean,
): PaneCopyCommand | string => {
  if (rest.length !== 1) {
    return 'pane copy takes one pane id.';
  }

  const target = parseId(rest[0] ?? '', 'pane');

  if (target === undefined) {
    return `'${rest[0] ?? ''}' is not a pane id, such as pane-1.`;
  }

  if (from === undefined) {
    return 'pane copy takes --from <row>:<col>.';
  }

  if (to === undefined) {
    return 'pane copy takes --to <row>:<col>.';
  }

  const start = parsePosition(from);

  if (start === undefined) {
    return `'${from}' is not a position. Use <row>:<col> with whole numbers of 0 or more.`;
  }

  const end = parsePosition(to);

  if (end === undefined) {
    return `'${to}' is not a position. Use <row>:<col> with whole numbers of 0 or more.`;
  }

  if (startsAfter(start, end)) {
    return `--from ${from} comes after --to ${to}.`;
  }

  return { action: 'copy', pane: paneId(target), start, end, print };
};
