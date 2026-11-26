import { diffMetrics, diffSize } from '../../kit/size.ts';
import type { DiffRow } from './diffRows.ts';
import { displayColumns } from './textWidth.ts';

export interface DiffLayout {
  gutterCharacters: number;
  gutterWidth: number;
  rowHeight: number;
  width: number;
}

const widestNumber = (rows: DiffRow[]): number =>
  Math.max(0, ...rows.map((row) => row.number ?? 0));

const widestText = (rows: DiffRow[]): number =>
  Math.max(0, ...rows.map((row) => displayColumns(row.text)));

export const diffLayout = (rows: DiffRow[], fontSize: number): DiffLayout => {
  const { rowHeight, characterWidth } = diffMetrics(fontSize);

  const gutterCharacters = Math.max(diffSize.gutterCharacters, String(widestNumber(rows)).length);

  const gutterWidth = Math.ceil(gutterCharacters * characterWidth) + 2;
  const textWidth = widestText(rows) * characterWidth;
  const width = Math.max(diffSize.minimumWidth, textWidth + gutterWidth + diffSize.widthPadding);

  return { gutterCharacters, gutterWidth, rowHeight, width };
};
