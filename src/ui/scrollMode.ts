import { scrollTopOf, shownView, viewedPane } from '../client/client.ts';
import type { AttachSession, RowCache, RowRange } from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import { CellWidth, cellWidthMask, cellWords } from '../rows/rows.ts';
import type { ScrollAction } from './input.ts';
import { moveScroll } from './scrollMotions.ts';
import type { ScrollMotion, ScrollResult, ScrollRow, ScrollRows } from './scrollMotions.ts';

export type ScrollModeSession = Pick<
  AttachSession,
  'getState' | 'rowCache' | 'scrollPane' | 'setInputMode' | 'subscribe' | 'subscribeFetched'
>;

interface ScrollCursor {
  pane: PaneId;
  // A stable row number.
  row: number;
  col: number;
}

export interface ScrollMode {
  handle: (action: ScrollAction) => void;
  // The cursor of the pane being scrolled, or undefined outside scroll mode.
  cursor: () => ScrollCursor | undefined;
  // The rows a waiting motion needs, which the pane's row hold must include.
  reach: (pane: PaneId) => RowRange | undefined;
  subscribe: (listener: () => void) => () => void;
}

interface ScrollState extends ScrollCursor {
  // The rows between the view top and the bottom at entry, which leaving restores. Undefined means
  // the view followed the bottom.
  entryOffset: number | undefined;
  // The view top this mode asked for, held until the server has answered every request. The server
  // owns the view; this value only lets keys typed before its answer build on each other.
  pending: { top: number | undefined } | undefined;
  unanswered: number;
  // Continues the waiting motion's scan from where it stopped.
  resume: ((rows: ScrollRows, top: number) => ScrollResult) | undefined;
  // The cache epoch the scan's progress belongs to.
  resumeEpoch: number | undefined;
  // Fetches that ended with the waiting row still absent.
  misses: number;
  // The active top the cursor row was last aligned to. While the view follows the bottom, output
  // advances the active top and the cursor moves with it, so it keeps its place in the view.
  alignedTop: number;
  // Whether the pane was focused at the last look.
  focused: boolean;
  // Motions that wait for the one at the front to finish.
  queue: ScrollMotion[];
  // The row the motion at the front needs, while its fetch runs.
  waiting: number | undefined;
}

const fetchChunkRows = 256;

const maxMisses = 3;

const waitsOutside = (current: ScrollState, oldest: number, last: number): boolean => {
  const { waiting } = current;

  if (waiting === undefined) {
    return false;
  }

  const outside = waiting < oldest || waiting > last;

  return outside;
};

const reachOf = (current: ScrollState, oldest: number, last: number): RowRange | undefined => {
  const { waiting } = current;

  if (waiting === undefined) {
    return undefined;
  }

  return waiting <= current.row
    ? { from: Math.max(oldest, waiting - fetchChunkRows + 1), to: waiting }
    : { from: waiting, to: Math.min(last, waiting + fetchChunkRows - 1) };
};

const blankCodePoint = 0x20;

const spacerWidths = new Set<number>([CellWidth.spacerTail, CellWidth.spacerHead]);

const cellTexts = (row: NonNullable<ReturnType<RowCache['rowAt']>>): string[] =>
  Array.from({ length: row.cells.length / cellWords }, (_, column) => {
    const start = column * cellWords;
    const flags = row.cells[start + cellWords - 1] ?? 0;

    if (spacerWidths.has(flags & cellWidthMask)) {
      return '';
    }

    const codePoint = row.cells[start] ?? 0;

    return (
      row.clusters.get(column) ?? String.fromCodePoint(codePoint === 0 ? blankCodePoint : codePoint)
    );
  });

const rowsOf = (cache: RowCache): ScrollRows | undefined => {
  const bounds = cache.bounds();
  const size = cache.size();

  if (bounds === undefined || size === undefined) {
    return undefined;
  }

  return {
    height: size.rows,
    columns: size.columns,
    oldest: bounds.oldest,
    activeTop: bounds.activeTop,
    epoch: bounds.epoch,
    row: (rowNumber): ScrollRow | undefined => {
      const row = cache.rowAt(rowNumber);

      return row === undefined ? undefined : { cells: cellTexts(row), wrapped: row.wrapped };
    },
  };
};

// The cell of the pane's own cursor on the shown screen, or the bottom-left cell when it hides.
const entryCursor = (cache: RowCache, rows: ScrollRows, top: number | undefined) => {
  const cursor = cache.cursor();

  if (top === undefined && cursor?.visible === true) {
    return { row: rows.activeTop + cursor.y, col: cursor.x };
  }

  return { row: (top ?? rows.activeTop) + rows.height - 1, col: 0 };
};

export const createScrollMode = (session: ScrollModeSession): ScrollMode => {
  const listeners = new Set<() => void>();
  let state: ScrollState | undefined;

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const viewTopOf = (current: ScrollState): number | undefined => {
    if (current.pending !== undefined) {
      return current.pending.top;
    }

    const { snapshot } = session.getState();

    return session.rowCache(current.pane)?.viewTop(scrollTopOf(shownView(snapshot), current.pane));
  };

  const align = (current: ScrollState): void => {
    const cache = session.rowCache(current.pane);
    const bounds = cache?.bounds();
    const columns = cache?.size()?.columns;

    if (columns !== undefined) {
      current.col = Math.min(current.col, Math.max(columns - 1, 0));
    }

    if (bounds === undefined) {
      return;
    }

    if (viewTopOf(current) === undefined) {
      current.row = Math.max(current.row + bounds.activeTop - current.alignedTop, bounds.oldest);
    }

    current.alignedTop = bounds.activeTop;
  };

  const scrollTo = (current: ScrollState, to: number | 'bottom'): void => {
    const cache = session.rowCache(current.pane);

    current.pending = { top: to === 'bottom' ? undefined : cache?.viewTop(to) };
    current.unanswered += 1;

    const answered = (): void => {
      current.unanswered -= 1;

      if (current.unanswered === 0) {
        current.pending = undefined;
      }
    };

    session.scrollPane(current.pane, to).then(answered).catch(answered);
  };

  const restoreEntry = (current: ScrollState): void => {
    const bounds = session.rowCache(current.pane)?.bounds();

    if (bounds === undefined) {
      return;
    }

    const wanted =
      current.entryOffset === undefined
        ? undefined
        : Math.max(bounds.activeTop - current.entryOffset, bounds.oldest);

    const top = wanted === undefined || wanted >= bounds.activeTop ? undefined : wanted;

    if (viewTopOf(current) !== top) {
      scrollTo(current, top ?? 'bottom');
    }
  };

  const stop = (restore: boolean): void => {
    const current = state;

    state = undefined;

    if (current !== undefined && restore) {
      restoreEntry(current);
    }

    notify();
  };

  const isFocused = (current: ScrollState): boolean =>
    viewedPane(session.getState().snapshot)?.id === current.pane;

  const step = (current: ScrollState, motion: ScrollMotion): 'done' | 'waiting' | 'lost' => {
    const cache = session.rowCache(current.pane);
    const rows = cache === undefined ? undefined : rowsOf(cache);

    if (rows === undefined) {
      return 'lost';
    }

    align(current);

    const top = viewTopOf(current);
    const last = rows.activeTop + rows.height - 1;
    const row = Math.min(Math.max(current.row, rows.oldest), last);
    const from = { row, col: current.col, top: top ?? rows.activeTop };
    const sameRows = current.resumeEpoch === rows.epoch;

    const result =
      (sameRows ? current.resume?.(rows, from.top) : undefined) ?? moveScroll(rows, from, motion);

    current.resume = undefined;

    if (result.kind === 'missing') {
      current.waiting = result.row;
      current.resume = result.resume;
      current.resumeEpoch = rows.epoch;

      return 'waiting';
    }

    const { position } = result;
    const nextTop = position.top >= rows.activeTop ? undefined : position.top;

    if (nextTop !== top) {
      scrollTo(current, nextTop ?? 'bottom');
    }

    current.row = position.row;
    current.col = position.col;
    current.misses = 0;

    return 'done';
  };

  const run = (current: ScrollState): void => {
    while (current.waiting === undefined && isFocused(current)) {
      const motion = current.queue[0];

      if (motion === undefined) {
        break;
      }

      const outcome = step(current, motion);

      if (outcome === 'lost') {
        stop(true);
        session.setInputMode('insert');

        return;
      }

      if (outcome === 'waiting') {
        break;
      }

      current.queue.shift();
    }

    notify();
  };

  const restartWaiting = (current: ScrollState): void => {
    current.waiting = undefined;
    current.resume = undefined;
    current.misses = 0;
    run(current);
  };

  const begin = (): void => {
    const { snapshot } = session.getState();
    const pane = viewedPane(snapshot);
    const cache = pane === undefined ? undefined : session.rowCache(pane.id);
    const rows = cache === undefined ? undefined : rowsOf(cache);

    if (pane === undefined || cache === undefined || rows === undefined) {
      session.setInputMode('normal');

      return;
    }

    const top = cache.viewTop(scrollTopOf(shownView(snapshot), pane.id));

    state = {
      pane: pane.id,
      entryOffset: top === undefined ? undefined : rows.activeTop - top,
      pending: undefined,
      unanswered: 0,
      misses: 0,
      resume: undefined,
      resumeEpoch: undefined,
      alignedTop: rows.activeTop,
      focused: true,
      queue: [],
      waiting: undefined,
      ...entryCursor(cache, rows, top),
    };

    notify();
  };

  // Entering on the pane a suspended mode belongs to resumes it, as herdr does.
  const enter = (): void => {
    const pane = viewedPane(session.getState().snapshot);

    if (state !== undefined && state.pane === pane?.id) {
      state.focused = true;
      run(state);

      return;
    }

    stop(true);
    begin();
  };

  // Losing focus suspends the mode with its state; gaining it back resumes it. A pane that is gone
  // ends it.
  const followFocus = (current: ScrollState): void => {
    const { snapshot } = session.getState();

    if (!snapshot.panes.some((pane) => pane.id === current.pane)) {
      const wasShown = current.focused;

      stop(false);

      if (wasShown && session.getState().inputMode === 'scroll') {
        session.setInputMode('insert');
      }

      return;
    }

    const focused = isFocused(current);

    if (focused === current.focused) {
      return;
    }

    current.focused = focused;

    if (!focused && session.getState().inputMode === 'scroll') {
      session.setInputMode('insert');
    }

    if (focused && session.getState().inputMode === 'insert') {
      session.setInputMode('scroll');
    }

    run(current);
  };

  session.subscribe(() => {
    if (state !== undefined) {
      followFocus(state);
    }
  });

  session.subscribeFetched((pane) => {
    const current = state;

    if (current === undefined || current.pane !== pane || current.waiting === undefined) {
      return;
    }

    const held = session.rowCache(pane)?.rowAt(current.waiting) !== undefined;

    if (!held) {
      current.misses += 1;
    }

    if (!held && current.misses < maxMisses) {
      notify();

      return;
    }

    if (!held) {
      current.queue.shift();
      current.misses = 0;
      current.resume = undefined;
    }

    current.waiting = undefined;
    run(current);
  });

  return {
    handle: (action) => {
      if (action.kind === 'enter') {
        enter();

        return;
      }

      if (state === undefined || !isFocused(state)) {
        return;
      }

      if (action.kind === 'leave') {
        stop(true);

        return;
      }

      state.queue.push(action.motion);
      run(state);
    },
    cursor: () => {
      if (state === undefined || !isFocused(state)) {
        return undefined;
      }

      align(state);

      return { pane: state.pane, row: state.row, col: state.col };
    },
    reach: (pane) => {
      const bounds = session.rowCache(pane)?.bounds();

      if (state?.pane !== pane || bounds === undefined) {
        return undefined;
      }

      const last = bounds.activeTop + (session.rowCache(pane)?.size()?.rows ?? 1) - 1;

      // Output pruned the row the motion waits for. Its fetch can never end, so run the motion
      // again from the cursor, which the scan clamps into the history.
      if (waitsOutside(state, bounds.oldest, last)) {
        restartWaiting(state);
      }

      return reachOf(state, bounds.oldest, last);
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};
