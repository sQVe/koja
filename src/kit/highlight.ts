export interface TextRun {
  text: string;
  highlighted: boolean;
}

const anyUnitMarked = (marked: ReadonlySet<number>, start: number, length: number): boolean => {
  for (let offset = 0; offset < length; offset += 1) {
    if (marked.has(start + offset)) {
      return true;
    }
  }

  return false;
};

export const highlightRuns = (text: string, positions: readonly number[]): TextRun[] => {
  const marked = new Set(positions);
  const runs: TextRun[] = [];
  let index = 0;

  for (const letter of text) {
    const highlighted = anyUnitMarked(marked, index, letter.length);
    const last = runs.at(-1);

    if (last?.highlighted === highlighted) {
      last.text += letter;
    } else {
      runs.push({ text: letter, highlighted });
    }

    index += letter.length;
  }

  return runs;
};
