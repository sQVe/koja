export interface FuzzyMatch {
  score: number;
  positions: number[];
}

const wordBoundary = /[\s:.\-_/]/;

const startBonus = 6;

const runBonus = 3;

const gapPenalty = 0.3;

const longestCountedGap = 6;

const lengthPenalty = 0.02;

const startsWord = (text: string, index: number): boolean =>
  index === 0 || wordBoundary.test(text.charAt(index - 1));

// The letters of `query` in order in `text`, case-insensitive; null when one is missing. Letters
// at word starts and runs of letters score higher, gaps and long texts lower. `query` is lower
// case.
export const fuzzyMatch = (query: string, text: string): FuzzyMatch | null => {
  const lower = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  let run = 0;

  for (const letter of query) {
    const index = lower.indexOf(letter, from);

    if (index === -1) {
      return null;
    }

    run = index === from && positions.length > 0 ? run + 1 : 0;

    const bonus = startsWord(lower, index) ? startBonus : 0;
    const gap = Math.min(index - from, longestCountedGap) * gapPenalty;

    score += 1 + bonus + run * runBonus - gap;
    positions.push(index);
    from = index + 1;
  }

  return { score: score - text.length * lengthPenalty, positions };
};
