export interface TextRun {
  text: string;
  highlighted: boolean;
}

// Splits text into runs of matched and unmatched letters, so a match costs a few elements, not
// one per letter. `positions` are string indexes, as `indexOf` reports them.
export const highlightRuns = (text: string, positions: readonly number[]): TextRun[] => {
  const marked = new Set(positions);
  const runs: TextRun[] = [];

  for (const [index, letter] of text.split('').entries()) {
    const highlighted = marked.has(index);
    const last = runs.at(-1);

    if (last?.highlighted === highlighted) {
      last.text += letter;
    } else {
      runs.push({ text: letter, highlighted });
    }
  }

  return runs;
};
