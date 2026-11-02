export interface Match {
  score: number;
  positions: number[];
}

const runScore = 8;

const wordStartScore = 6;

const gapPenalty = 0.2;

const longestCountedGap = 5;

// Letters may spread over at most this many characters per letter, plus the slack below.
const spreadPerLetter = 2;

const spreadSlack = 4;

const isWordStart = (text: string, index: number): boolean =>
  index === 0 || /[\s/_.\-~]/.test(text.charAt(index - 1));

// Letters spread far apart match almost any long text, so a match must stay close together
// unless every letter after the first starts a word or follows the one before.
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

// Each query letter in order, case-insensitive. Runs of letters and letters at word starts
// score higher, gaps lower. Null when the letters aren't all there, or too far apart.
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

// The best match in any one field; letters never match across fields.
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
