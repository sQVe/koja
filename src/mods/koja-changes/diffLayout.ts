import { diffMetrics, diffSize } from '../../kit/size.ts';
import type { DiffRow } from './diffRows.ts';
import { displayColumns } from './textWidth.ts';

export interface DiffLayout {
  gutterCharacters: number;
  gutterWidth: number;
  rowHeight: number;
  width: number;
}

export interface DiffDocument {
  rows: DiffRow[];
  widestNumber: number;
  widestText: number;
}

export const measureDiff = (rows: DiffRow[]): DiffDocument => {
  let widestNumber = 0;
  let widestText = 0;

  for (const row of rows) {
    widestNumber = Math.max(widestNumber, row.number ?? 0);
    widestText = Math.max(widestText, displayColumns(row.text));
  }

  return { rows, widestNumber, widestText };
};

export const diffLayout = (document: DiffDocument, fontSize: number): DiffLayout => {
  const { rowHeight, characterWidth } = diffMetrics(fontSize);

  const gutterCharacters = Math.max(
    diffSize.gutterCharacters,
    String(document.widestNumber).length,
  );

  const gutterWidth = Math.ceil(gutterCharacters * characterWidth) + 2;
  const textWidth = document.widestText * characterWidth;
  const width = Math.max(diffSize.minimumWidth, textWidth + gutterWidth + diffSize.widthPadding);

  return { gutterCharacters, gutterWidth, rowHeight, width };
};
