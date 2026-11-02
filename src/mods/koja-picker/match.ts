export interface Match {
  score: number;
  positions: number[];
}

const runScore = 8;

const wordStartScore = 6;

const gapPenalty = 0.2;

const longestCountedGap = 5;

const spreadPerLetter = 2;

const spreadSlack = 4;

const isWordStart = (text: string, index: number): boolean =>
  index === 0 || /[\s/_.\-~]/.test(text.charAt(index - 1));

const isCompact = (text: string, positions: number[]): boolean => {
  const first = positions[0] ?? 0;
  const last = positions.at(-1) ?? 0;

  if (last - first + 1 <= positions.length * spreadPerLetter + spreadSlack) {
    return true;
  }

  return positions
    .slice(1)
    .every(
      (position, index) => position === (positions[index] ?? 0) + 1 || isWordStart(text, position),
    );
};

export const fuzzyMatch = (query: string, text: string): Match | null => {
  const lowerText = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let from = 0;

  for (const letter of query.toLowerCase()) {
    const index = lowerText.indexOf(letter, from);

    if (index === -1) {
      return null;
    }

    const follows = positions.at(-1) === index - 1;

    score += follows ? runScore : 1;
    score += isWordStart(text, index) ? wordStartScore : 0;
    score -= Math.min(index - from, longestCountedGap) * gapPenalty;
    positions.push(index);
    from = index + 1;
  }

  if (positions.length > 0 && !isCompact(text, positions)) {
    return null;
  }

  return { score, positions };
};

export const bestFieldMatch = (
  query: string,
  fields: (string | null | undefined)[],
): Match | null => {
  let best: Match | null = null;

  for (const field of fields) {
    const match =
      field === null || field === undefined || field === '' ? null : fuzzyMatch(query, field);

    if (match === null) {
      continue;
    }

    if (best === null || match.score > best.score) {
      best = match;
    }
  }

  return best;
};
