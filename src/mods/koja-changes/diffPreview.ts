import { diffSize } from '../../kit/index.ts';
import type { DiffRow } from './diffRows.ts';
import { diffRows } from './diffRows.ts';
import type { ChangesSnapshot } from './git.ts';
import { loadFilePreview } from './preview.ts';
import type { FilePreview } from './preview.ts';

export class DiffPreview {
  rows: DiffRow[] = [];

  diffWidth: number = diffSize.minimumWidth;

  private previewRequest = 0;

  setLines(lines: string[]): void {
    this.rows = diffRows(lines);

    this.diffWidth = Math.max(
      diffSize.minimumWidth,
      ...lines.map((line) => line.length * diffSize.characterWidth + diffSize.widthPadding),
    );
  }

  async load(
    path: string,
    getSnapshot: () => ChangesSnapshot | null,
    stillOpen: () => boolean,
  ): Promise<void> {
    const snapshot = getSnapshot();
    const file = snapshot?.files.find((candidate) => candidate.path === path);

    if (snapshot === null || file === undefined) {
      return;
    }

    // Reopening the same file starts a second preview while the first may still run, so the path
    // check alone cannot drop the older result.
    const request = this.previewRequest + 1;

    this.previewRequest = request;

    const isLatest = (): boolean => request === this.previewRequest;
    let preview: FilePreview;

    try {
      preview = await loadFilePreview(file, snapshot);
    } catch (error) {
      if (isLatest()) {
        throw error;
      }

      return;
    }

    if (preview.addedLines !== null) {
      file.add = preview.addedLines;
    }

    if (!isLatest()) {
      return;
    }

    if (stillOpen()) {
      this.setLines(preview.lines);
    }
  }
}
