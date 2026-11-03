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

// Each letter gets one occurrence table, so the rescue does not rescan the suffix per start.
const positionsOf = (text: string, letter: string): number[] => {
  const positions: number[] = [];
  let at = text.indexOf(letter);

  while (at !== -1) {
    positions.push(at);
    at = text.indexOf(letter, at + 1);
  }

  return positions;
};

const firstAtOrAfter = (positions: number[], from: number): number => {
  let low = 0;
  let high = positions.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if ((positions[middle] ?? 0) < from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return positions[low] ?? -1;
};

const matchFrom = (
  lowerQuery: string,
  tables: ReadonlyMap<string, number[]>,
  text: string,
  searchFrom: number,
): Match | null => {
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  let searching = searchFrom;

  for (const letter of lowerQuery) {
    const index = firstAtOrAfter(tables.get(letter) ?? [], searching);

    if (index === -1) {
      return null;
    }

    const follows = positions.at(-1) === index - 1;

    score += follows ? runScore : 1;
    score += isWordStart(text, index) ? wordStartScore : 0;
    score -= Math.min(index - from, longestCountedGap) * gapPenalty;
    positions.push(index);
    from = index + 1;
    searching = index + 1;
  }

  if (positions.length > 0 && !isCompact(text, positions)) {
    return null;
  }

  return { score, positions };
};

export const fuzzyMatch = (query: string, text: string): Match | null => {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery === '') {
    return { score: 0, positions: [] };
  }

  const lowerText = text.toLowerCase();
  const tables = new Map<string, number[]>();
  let missing = false;

  for (const letter of new Set(lowerQuery)) {
    const positions = positionsOf(lowerText, letter);

    tables.set(letter, positions);

    if (positions.length === 0) {
      missing = true;
    }
  }

  if (missing) {
    return null;
  }

  const firstLetter = Array.from(lowerQuery)[0] ?? '';
  const firstPositions = tables.get(firstLetter) ?? [];

  // The first occurrence keeps today's ranking; later starts rescue a spread-out first match.
  const first = matchFrom(lowerQuery, tables, text, firstPositions[0] ?? 0);

  if (first !== null) {
    return first;
  }

  let best: Match | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const start of firstPositions.slice(1)) {
    const candidate = matchFrom(lowerQuery, tables, text, start);

    if (candidate !== null && candidate.score > bestScore) {
      best = candidate;
      bestScore = candidate.score;
    }
  }

  return best;
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
