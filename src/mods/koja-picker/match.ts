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
  // Folded code point index to original character index.
  originalOf: readonly number[];
  // Original character index to its UTF-16 offset in `text`.
  originalOffsets: readonly number[];
  // Original character index to its first folded code point index.
  foldedStarts: readonly number[];
  // Folded code point index to whether that code point starts a word.
  startsWord: readonly boolean[];
}

interface RouteState {
  positions: number[];
  score: number;
  nextFolded: number;
  previousOriginal: number;
}

interface RouteBudget {
  spent: number;
  limit: number;
}

interface RouteSearch {
  queryCodePoints: readonly string[];
  folded: FoldedText;
  tables: ReadonlyMap<string, OccurrenceTable>;
  failed: Set<number>;
  budget: RouteBudget;
}

const runScore = 8;

const wordStartScore = 6;

const gapPenalty = 0.2;

const longestCountedGap = 5;

const spreadPerLetter = 2;

const spreadSlack = 4;

const routeWorkBudget = 4096;

// The word-start separators `\s`, `/`, `_`, `.`, `-`, and `~`, as a Set so each check is a lookup.
const wordSeparators = new Set(
  '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff/_.-~',
);

const isWordStart = (text: string, index: number): boolean =>
  index === 0 || wordSeparators.has(text.charAt(index - 1));

const startsWordAt = (folded: FoldedText, originalIndex: number): boolean =>
  folded.startsWord[folded.foldedStarts[originalIndex] ?? 0] ?? false;

const isRunOrWordStart = (
  folded: FoldedText,
  originalIndex: number,
  previousOriginal: number,
): boolean => {
  const follows = originalIndex === previousOriginal + 1;
  const startsWord = startsWordAt(folded, originalIndex);

  return follows || startsWord;
};

// Lowercasing one character at a time can pick a different case form than the whole string does,
// so only the per-character folded length is used.
const foldedLengths = (characters: readonly string[]): number[] =>
  characters.map((character) => Array.from(character.toLowerCase()).length);

const foldText = (text: string): FoldedText => {
  const characters = Array.from(text);
  const folded = Array.from(text.toLowerCase());
  const lengths = foldedLengths(characters);
  const originalOffsets: number[] = [];
  const foldedStarts: number[] = [];
  const originalOf: number[] = [];
  const startsWord: boolean[] = [];
  let offset = 0;
  let foldedStart = 0;

  for (const [index, character] of characters.entries()) {
    originalOffsets.push(offset);
    foldedStarts.push(foldedStart);

    const foldedLength = lengths[index] ?? 0;
    const startsWordHere = isWordStart(text, offset);

    for (let count = 0; count < foldedLength; count += 1) {
      originalOf.push(index);
      startsWord.push(startsWordHere);
    }

    offset += character.length;
    foldedStart += foldedLength;
  }

  return { text, folded, originalOf, originalOffsets, foldedStarts, startsWord };
};

const isCompact = (folded: FoldedText, positions: readonly number[]): boolean => {
  const first = positions[0] ?? 0;
  const last = positions.at(-1) ?? 0;

  if (last - first + 1 <= positions.length * spreadPerLetter + spreadSlack) {
    return true;
  }

  return positions.slice(1).every((position, index) => {
    const previous = positions[index] ?? 0;

    return isRunOrWordStart(folded, position, previous);
  });
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

class OccurrenceTable {
  readonly positions: readonly number[];
  readonly wordStarts: readonly number[];

  constructor(positions: readonly number[], wordStarts: readonly number[]) {
    this.positions = positions;
    this.wordStarts = wordStarts;
  }

  firstAtOrAfter(from: number): number {
    return firstAtOrAfter(this.positions, from);
  }

  firstWordStartAtOrAfter(from: number): number {
    return firstAtOrAfter(this.wordStarts, from);
  }
}

// Each letter gets one occurrence table, so the rescue does not rescan the suffix per start.
const occurrenceTables = (
  folded: FoldedText,
  queryCodePoints: readonly string[],
): Map<string, OccurrenceTable> => {
  const positions = new Map<string, number[]>();
  const wordStarts = new Map<string, number[]>();

  for (const letter of new Set(queryCodePoints)) {
    positions.set(letter, []);
    wordStarts.set(letter, []);
  }

  for (const [foldedIndex, letter] of folded.folded.entries()) {
    const letterPositions = positions.get(letter);

    if (letterPositions === undefined) {
      continue;
    }

    letterPositions.push(foldedIndex);

    if (folded.startsWord[foldedIndex] === true) {
      wordStarts.get(letter)?.push(foldedIndex);
    }
  }

  const tables = new Map<string, OccurrenceTable>();

  for (const [letter, letterPositions] of positions) {
    const letterWordStarts = wordStarts.get(letter) ?? [];

    tables.set(letter, new OccurrenceTable(letterPositions, letterWordStarts));
  }

  return tables;
};

const scoreStep = (folded: FoldedText, originalIndex: number, previous: number | null): number => {
  const from = previous === null ? 0 : previous + 1;
  const follows = previous !== null && originalIndex === from;
  const startsWord = startsWordAt(folded, originalIndex);
  const gap = Math.min(originalIndex - from, longestCountedGap);

  return (follows ? runScore : 1) + (startsWord ? wordStartScore : 0) - gap * gapPenalty;
};

const matchFrom = (
  queryCodePoints: readonly string[],
  folded: FoldedText,
  tables: ReadonlyMap<string, OccurrenceTable>,
  searchFrom: number,
): Match | null => {
  const originalPositions: number[] = [];
  let score = 0;
  let previous: number | null = null;
  let searching = searchFrom;

  for (const letter of queryCodePoints) {
    const table = tables.get(letter);
    const foldedIndex = table?.firstAtOrAfter(searching) ?? -1;

    if (foldedIndex === -1) {
      return null;
    }

    searching = foldedIndex + 1;

    const originalIndex = folded.originalOf[foldedIndex] ?? 0;

    if (originalIndex === previous) {
      continue;
    }

    score += scoreStep(folded, originalIndex, previous);
    originalPositions.push(originalIndex);
    previous = originalIndex;
  }

  if (originalPositions.length > 0 && !isCompact(folded, originalPositions)) {
    return null;
  }

  const positions = originalPositions.map((index) => folded.originalOffsets[index] ?? 0);

  return { score, positions };
};

const continuesRoute = (
  folded: FoldedText,
  originalIndex: number,
  previousOriginal: number,
): boolean =>
  originalIndex === previousOriginal || isRunOrWordStart(folded, originalIndex, previousOriginal);

const extendRoute = (
  folded: FoldedText,
  state: RouteState,
  originalIndex: number,
  nextFolded: number,
): RouteState => {
  if (originalIndex === state.previousOriginal) {
    return { ...state, nextFolded };
  }

  const score = state.score + scoreStep(folded, originalIndex, state.previousOriginal);

  return {
    positions: [...state.positions, originalIndex],
    score,
    nextFolded,
    previousOriginal: originalIndex,
  };
};

const hasRouteWork = (budget: RouteBudget): boolean => budget.spent < budget.limit;

const nearestRouteCandidate = (
  search: RouteSearch,
  state: RouteState,
  table: OccurrenceTable,
): number => {
  const { folded, budget } = search;

  budget.spent += 1;
  const nearest = table.firstAtOrAfter(state.nextFolded);

  if (nearest === -1) {
    return -1;
  }

  const originalIndex = folded.originalOf[nearest] ?? 0;

  if (!continuesRoute(folded, originalIndex, state.previousOriginal)) {
    return -1;
  }

  return nearest;
};

const adjacentRouteCandidate = (
  search: RouteSearch,
  state: RouteState,
  table: OccurrenceTable,
  nearest: number,
): number => {
  const { folded, budget } = search;
  const adjacentStart = folded.foldedStarts[state.previousOriginal + 1];

  if (adjacentStart === undefined || !hasRouteWork(budget)) {
    return -1;
  }

  budget.spent += 1;
  const candidate = table.firstAtOrAfter(adjacentStart);

  if (candidate === -1) {
    return -1;
  }

  const originalIndex = folded.originalOf[candidate] ?? 0;

  if (originalIndex !== state.previousOriginal + 1 || candidate === nearest) {
    return -1;
  }

  return candidate;
};

const routeFromWordStarts = (
  search: RouteSearch,
  state: RouteState,
  table: OccurrenceTable,
  tryCandidate: (foldedIndex: number) => Match | null,
): Match | null => {
  const { budget } = search;

  if (!hasRouteWork(budget)) {
    return null;
  }

  budget.spent += 1;
  let wordStart = table.firstWordStartAtOrAfter(state.nextFolded);

  while (wordStart !== -1) {
    const result = tryCandidate(wordStart);

    if (result !== null) {
      return result;
    }

    if (!hasRouteWork(budget)) {
      return null;
    }

    budget.spent += 1;
    wordStart = table.firstWordStartAtOrAfter(wordStart + 1);
  }

  return null;
};

// Tries every viable occurrence while the budget lasts: the nearest occurrence, the occurrence
// adjacent to the previous one, and every word start after them.
const routeFromOccurrences = (
  search: RouteSearch,
  state: RouteState,
  table: OccurrenceTable,
  tryCandidate: (foldedIndex: number) => Match | null,
): Match | null => {
  const nearest = nearestRouteCandidate(search, state, table);

  if (nearest !== -1) {
    const result = tryCandidate(nearest);

    if (result !== null) {
      return result;
    }
  }

  const adjacent = adjacentRouteCandidate(search, state, table, nearest);

  if (adjacent !== -1) {
    const result = tryCandidate(adjacent);

    if (result !== null) {
      return result;
    }
  }

  const skip = new Set([nearest, adjacent]);

  const tryWordStart = (foldedIndex: number): Match | null =>
    skip.has(foldedIndex) ? null : tryCandidate(foldedIndex);

  return routeFromWordStarts(search, state, table, tryWordStart);
};

// Explores the word-start and adjacent occurrences a greedy pass skipped. A failed state is
// remembered, and one budget bounds the whole search so backtracking cannot grow without limit.
const routeFrom = (search: RouteSearch, queryAt: number, state: RouteState): Match | null => {
  const { queryCodePoints, folded, tables, failed, budget } = search;

  if (queryAt === queryCodePoints.length) {
    const positions = state.positions.map((index) => folded.originalOffsets[index] ?? 0);

    return { score: state.score, positions };
  }

  if (!hasRouteWork(budget)) {
    return null;
  }

  const failedKey = queryAt * (folded.folded.length + 1) + state.nextFolded;

  if (failed.has(failedKey)) {
    return null;
  }

  const table = tables.get(queryCodePoints[queryAt] ?? '');

  if (table === undefined) {
    return null;
  }

  const tryCandidate = (foldedIndex: number): Match | null => {
    if (!hasRouteWork(budget)) {
      return null;
    }

    budget.spent += 1;

    const originalIndex = folded.originalOf[foldedIndex] ?? 0;
    const next = extendRoute(folded, state, originalIndex, foldedIndex + 1);

    return routeFrom(search, queryAt + 1, next);
  };

  const result = routeFromOccurrences(search, state, table, tryCandidate);

  if (result === null && hasRouteWork(budget)) {
    failed.add(failedKey);
  }

  return result;
};

const routeMatch = (
  queryCodePoints: readonly string[],
  folded: FoldedText,
  tables: ReadonlyMap<string, OccurrenceTable>,
  firstPositions: readonly number[],
): Match | null => {
  const search: RouteSearch = {
    queryCodePoints,
    folded,
    tables,
    failed: new Set<number>(),
    budget: { spent: 0, limit: routeWorkBudget },
  };

  const starts = [...firstPositions];
  let nextStart = 0;

  while (nextStart < starts.length) {
    const remainingWork = routeWorkBudget - search.budget.spent;

    if (remainingWork <= 0) {
      break;
    }

    const remainingStarts = starts.length - nextStart;
    const share = Math.max(1, Math.floor(remainingWork / remainingStarts));
    const firstFolded = starts[nextStart] ?? 0;

    nextStart += 1;

    search.budget.limit = search.budget.spent + share;

    const firstOriginal = folded.originalOf[firstFolded] ?? 0;

    const state: RouteState = {
      positions: [firstOriginal],
      score: scoreStep(folded, firstOriginal, null),
      nextFolded: firstFolded + 1,
      previousOriginal: firstOriginal,
    };

    const result = routeFrom(search, 1, state);

    if (result !== null) {
      return result;
    }

    // A start that spent its whole share gets the work the cheaper starts left over.
    if (!hasRouteWork(search.budget)) {
      starts.push(firstFolded);
    }
  }

  return null;
};

export const fuzzyMatch = (query: string, text: string): Match | null => {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery === '') {
    return { score: 0, positions: [] };
  }

  const queryCodePoints = Array.from(lowerQuery);
  const folded = foldText(text);
  const tables = occurrenceTables(folded, queryCodePoints);

  const missing = queryCodePoints.some(
    (letter) => (tables.get(letter)?.positions.length ?? 0) === 0,
  );

  if (missing) {
    return null;
  }

  const firstPositions = tables.get(queryCodePoints[0] ?? '')?.positions ?? [];

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

  return routeMatch(queryCodePoints, folded, tables, firstPositions);
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
