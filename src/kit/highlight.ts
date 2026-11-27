export interface TextRun {
  text: string;
  highlighted: boolean;
}

export const highlightRuns = (text: string, positions: readonly number[]): TextRun[] => {
  const marked = new Set(positions);
  const runs: TextRun[] = [];
  let index = 0;

  for (const letter of text) {
    const highlighted = marked.has(index);
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
