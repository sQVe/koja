import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { masterPanes, tabPanes } from '../layout.ts';
import type { PaneRectangle, ResizeDirection, TerminalSize } from '../layout.ts';
import { focusPane } from './paneTransitions.ts';
import type { Intent, State, Tab } from './store.ts';
import { refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';

type FocusPaneInDirectionIntent = Extract<Intent, { type: 'focusPaneInDirection' }>;

interface Span {
  start: number;
  end: number;
}

interface Neighbor {
  pane: PaneRectangle;
  gap: number;
  overlap: number;
}

const isHorizontal = (direction: ResizeDirection): boolean =>
  direction === 'left' || direction === 'right';

const horizontalSpan = (pane: PaneRectangle): Span => ({
  start: pane.x,
  end: pane.x + pane.columns,
});

const verticalSpan = (pane: PaneRectangle): Span => ({ start: pane.y, end: pane.y + pane.rows });

const sharedCells = (first: Span, second: Span): number =>
  Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start));

// Cells between the pane's edge and the candidate's facing edge. Negative when the candidate is not
// past the edge.
const gapToward = (
  from: PaneRectangle,
  candidate: PaneRectangle,
  direction: ResizeDirection,
): number => {
  const gaps: Record<ResizeDirection, number> = {
    right: candidate.x - (from.x + from.columns),
    left: from.x - (candidate.x + candidate.columns),
    down: candidate.y - (from.y + from.rows),
    up: from.y - (candidate.y + candidate.rows),
  };

  return gaps[direction];
};

const overlapAcross = (
  from: PaneRectangle,
  candidate: PaneRectangle,
  direction: ResizeDirection,
): number =>
  isHorizontal(direction)
    ? sharedCells(verticalSpan(from), verticalSpan(candidate))
    : sharedCells(horizontalSpan(from), horizontalSpan(candidate));

const neighborOf = (
  from: PaneRectangle,
  candidate: PaneRectangle,
  direction: ResizeDirection,
): Neighbor | undefined => {
  const gap = gapToward(from, candidate, direction);
  const overlap = overlapAcross(from, candidate, direction);

  return gap >= 0 && overlap > 0 ? { pane: candidate, gap, overlap } : undefined;
};

const tieStart = (pane: PaneRectangle, direction: ResizeDirection): number =>
  isHorizontal(direction) ? pane.y : pane.x;

const compareNeighbors = (first: Neighbor, second: Neighbor, direction: ResizeDirection): number =>
  first.gap - second.gap ||
  second.overlap - first.overlap ||
  tieStart(first.pane, direction) - tieStart(second.pane, direction);

// The neighbor is the nearest pane that lies wholly past the pane's edge in the direction and
// overlaps it on the other axis by at least one cell. Ties go to the larger overlap, then to the
// smaller y for left and right or the smaller x for up and down. Nothing wraps around an edge.
export const paneInDirection = (
  panes: readonly PaneRectangle[],
  from: PaneId,
  direction: ResizeDirection,
): PaneId | undefined => {
  const current = panes.find((pane) => pane.paneId === from);

  if (current === undefined) {
    return undefined;
  }

  const neighbors = panes
    .map((candidate) => neighborOf(current, candidate, direction))
    .filter((neighbor): neighbor is Neighbor => neighbor !== undefined)
    .toSorted((first, second) => compareNeighbors(first, second, direction));

  return neighbors[0]?.pane.paneId;
};

// A zoomed tab moves through the layout it hides. A master tab too small for its panes moves
// through the panes at the smallest size it accepts.
const navigablePanes = (tab: Tab, size: TerminalSize): PaneRectangle[] => {
  const placed = tabPanes({ ...tab, zoomedPaneId: undefined }, size);

  if (placed.ok) {
    return placed.panes;
  }

  const fitted = masterPanes(tab.arrangement.order, placed.required);

  invariant(fitted.ok, `Tab ${tab.id} has no panes to navigate.`);

  return fitted.panes;
};

export const focusPaneInDirection = (state: State, intent: FocusPaneInDirectionIntent): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === intent.paneId);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (tab === undefined) {
    return refuse('unknownPane');
  }

  const panes = navigablePanes(tab, state.layoutArea);
  const neighbor = paneInDirection(panes, intent.paneId, intent.direction);

  if (neighbor === undefined) {
    return refuse('noPaneInDirection');
  }

  return focusPane(state, neighbor, intent.clientId);
};
