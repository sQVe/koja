export interface Match {
  score: number;
  positions: number[];
}

export interface FieldMatch extends Match {
  field: string;
}

interface FoldedText {
  text: string;
  folded: readonly string[];
  originalOf: readonly number[];
  starts: readonly number[];
}

interface RouteState {
  positions: number[];
  score: number;
  nextFolded: number;
  previousOriginal: number;
  from: number;
}

const runScore = 8;

const wordStartScore = 6;

const gapPenalty = 0.2;

const longestCountedGap = 5;

const spreadPerLetter = 2;

const spreadSlack = 4;

const isWordStart = (text: string, index: number): boolean =>
  index === 0 || /[\s/_.\-~]/.test(text.charAt(index - 1));

// Lowercasing one character at a time can pick a different case form than the whole string does,
// so only the per-character folded length is used.
const foldedLengths = (characters: readonly string[]): number[] =>
  characters.map((character) => Array.from(character.toLowerCase()).length);

const foldText = (text: string): FoldedText => {
  const characters = Array.from(text);
  const folded = Array.from(text.toLowerCase());
  const lengths = foldedLengths(characters);
  const starts: number[] = [];
  const originalOf: number[] = [];
  let start = 0;

  for (const [index, character] of characters.entries()) {
    starts.push(start);

    const foldedLength = lengths[index] ?? 0;

    for (let count = 0; count < foldedLength; count += 1) {
      originalOf.push(index);
    }

    start += character.length;
  }

  return { text, folded, originalOf, starts };
};

const isCompact = (folded: FoldedText, positions: readonly number[]): boolean => {
  const first = positions[0] ?? 0;
  const last = positions.at(-1) ?? 0;

  if (last - first + 1 <= positions.length * spreadPerLetter + spreadSlack) {
    return true;
  }

  return positions.slice(1).every((position, index) => {
    const previous = positions[index] ?? 0;
    const follows = position === previous + 1;
    const startsWord = isWordStart(folded.text, folded.starts[position] ?? 0);

    return follows || startsWord;
  });
};

// Each letter gets one occurrence table, so the rescue does not rescan the suffix per start.
const occurrenceTables = (
  folded: readonly string[],
  queryCodePoints: readonly string[],
): Map<string, number[]> => {
  const tables = new Map<string, number[]>();

  for (const letter of new Set(queryCodePoints)) {
    tables.set(letter, []);
  }

  for (const [index, codePoint] of folded.entries()) {
    tables.get(codePoint)?.push(index);
  }

  return tables;
};

const firstAtOrAfter = (positions: readonly number[], from: number): number => {
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

const scoreStep = (
  folded: FoldedText,
  originalIndex: number,
  previous: number | null,
  from: number,
): number => {
  const follows = previous !== null && originalIndex === previous + 1;
  const startsWord = isWordStart(folded.text, folded.starts[originalIndex] ?? 0);
  const gap = Math.min(originalIndex - from, longestCountedGap);

  return (follows ? runScore : 1) + (startsWord ? wordStartScore : 0) - gap * gapPenalty;
};

const matchFrom = (
  queryCodePoints: readonly string[],
  folded: FoldedText,
  tables: ReadonlyMap<string, number[]>,
  searchFrom: number,
): Match | null => {
  const originalPositions: number[] = [];
  let score = 0;
  let from = 0;
  let previous: number | null = null;
  let searching = searchFrom;

  for (const letter of queryCodePoints) {
    const foldedIndex = firstAtOrAfter(tables.get(letter) ?? [], searching);

    if (foldedIndex === -1) {
      return null;
    }

    searching = foldedIndex + 1;

    const originalIndex = folded.originalOf[foldedIndex] ?? 0;

    if (originalIndex === previous) {
      continue;
    }

    score += scoreStep(folded, originalIndex, previous, from);
    originalPositions.push(originalIndex);
    previous = originalIndex;
    from = originalIndex + 1;
  }

  if (originalPositions.length > 0 && !isCompact(folded, originalPositions)) {
    return null;
  }

  const positions = originalPositions.map((index) => folded.starts[index] ?? 0);

  return { score, positions };
};

const continuesRoute = (
  folded: FoldedText,
  originalIndex: number,
  previousOriginal: number,
): boolean => {
  if (originalIndex === previousOriginal) {
    return true;
  }

  if (originalIndex === previousOriginal + 1) {
    return true;
  }

  return isWordStart(folded.text, folded.starts[originalIndex] ?? 0);
};

const extendRoute = (
  folded: FoldedText,
  state: RouteState,
  originalIndex: number,
  nextFolded: number,
): RouteState => {
  if (originalIndex === state.previousOriginal) {
    return { ...state, nextFolded };
  }

  const score = state.score + scoreStep(folded, originalIndex, state.previousOriginal, state.from);

  return {
    positions: [...state.positions, originalIndex],
    score,
    nextFolded,
    previousOriginal: originalIndex,
    from: originalIndex + 1,
  };
};

// Explores the word-start and adjacent occurrences a greedy pass skipped. A failed state is
// remembered so the exploration stays bounded by the query length and the text length.
const routeFrom = (
  queryCodePoints: readonly string[],
  queryAt: number,
  folded: FoldedText,
  tables: ReadonlyMap<string, number[]>,
  state: RouteState,
  failed: Set<number>,
): Match | null => {
  if (queryAt === queryCodePoints.length) {
    const positions = state.positions.map((index) => folded.starts[index] ?? 0);

    return { score: state.score, positions };
  }

  const failedKey = queryAt * (folded.folded.length + 1) + state.nextFolded;

  if (failed.has(failedKey)) {
    return null;
  }

  const occurrences = tables.get(queryCodePoints[queryAt] ?? '') ?? [];
  let foldedIndex = firstAtOrAfter(occurrences, state.nextFolded);

  while (foldedIndex !== -1) {
    const originalIndex = folded.originalOf[foldedIndex] ?? 0;

    if (continuesRoute(folded, originalIndex, state.previousOriginal)) {
      const next = extendRoute(folded, state, originalIndex, foldedIndex + 1);
      const result = routeFrom(queryCodePoints, queryAt + 1, folded, tables, next, failed);

      if (result !== null) {
        return result;
      }
    }

    foldedIndex = firstAtOrAfter(occurrences, foldedIndex + 1);
  }

  failed.add(failedKey);

  return null;
};

const routeMatch = (
  queryCodePoints: readonly string[],
  folded: FoldedText,
  tables: ReadonlyMap<string, number[]>,
): Match | null => {
  const firstFolded = firstAtOrAfter(tables.get(queryCodePoints[0] ?? '') ?? [], 0);

  if (firstFolded === -1) {
    return null;
  }

  const firstOriginal = folded.originalOf[firstFolded] ?? 0;

  const state: RouteState = {
    positions: [firstOriginal],
    score: scoreStep(folded, firstOriginal, null, 0),
    nextFolded: firstFolded + 1,
    previousOriginal: firstOriginal,
    from: firstOriginal + 1,
  };

  return routeFrom(queryCodePoints, 1, folded, tables, state, new Set<number>());
};

export const fuzzyMatch = (query: string, text: string): Match | null => {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery === '') {
    return { score: 0, positions: [] };
  }

  const queryCodePoints = Array.from(lowerQuery);
  const folded = foldText(text);
  const tables = occurrenceTables(folded.folded, queryCodePoints);
  const missing = queryCodePoints.some((letter) => (tables.get(letter) ?? []).length === 0);

  if (missing) {
    return null;
  }

  const firstPositions = tables.get(queryCodePoints[0] ?? '') ?? [];

  // The first occurrence keeps today's ranking; later starts rescue a spread-out first match.
  const first = matchFrom(queryCodePoints, folded, tables, firstPositions[0] ?? 0);

  if (first !== null) {
    return first;
  }

  let best: Match | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const start of firstPositions.slice(1)) {
    const candidate = matchFrom(queryCodePoints, folded, tables, start);

    if (candidate !== null && candidate.score > bestScore) {
      best = candidate;
      bestScore = candidate.score;
    }
  }

  if (best !== null) {
    return best;
  }

  return routeMatch(queryCodePoints, folded, tables);
};

export const bestFieldMatch = (
  query: string,
  fields: (string | null | undefined)[],
): FieldMatch | null => {
  let best: FieldMatch | null = null;

  for (const field of fields) {
    if (field === null || field === undefined || field === '') {
      continue;
    }

    const match = fuzzyMatch(query, field);

    if (match === null) {
      continue;
    }

    if (best === null || match.score > best.score) {
      best = { ...match, field };
    }
  }

  return best;
};
