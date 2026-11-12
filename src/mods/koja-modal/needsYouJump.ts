import type { Status } from 'herdr';

import { needsYou } from '../../kit/needsYou.ts';

export interface JumpSpace {
  id: string;
  tabs: { id: string }[];
}

export interface JumpPane {
  pane: string;
  tab: string;
  status: Status | null;
}

export interface JumpTarget {
  space: string;
  tab: string;
  pane: string;
}

export interface JumpFacts {
  step: 1 | -1;
  visibleSpaces: readonly string[];
  spaces: readonly JumpSpace[];
  panes: readonly JumpPane[];
  focusedPane: string | null;
}

interface WalkStop extends JumpTarget {
  status: Status | null;
}

const stopsOfSpace = (space: JumpSpace, panes: readonly JumpPane[]): WalkStop[] =>
  space.tabs.flatMap((tab) =>
    panes
      .filter((pane) => pane.tab === tab.id)
      .map((pane) => ({ space: space.id, tab: tab.id, pane: pane.pane, status: pane.status })),
  );

const walkOf = (facts: JumpFacts): WalkStop[] =>
  facts.visibleSpaces.flatMap((id) => {
    const space = facts.spaces.find((candidate) => candidate.id === id);

    return space === undefined ? [] : stopsOfSpace(space, facts.panes);
  });

export const needsYouTarget = (facts: JumpFacts): JumpTarget | null => {
  const walk = walkOf(facts);
  const ordered = facts.step === 1 ? walk : walk.toReversed();
  const focusedIndex = ordered.findIndex((stop) => stop.pane === facts.focusedPane);
  const before = ordered.slice(0, Math.max(focusedIndex, 0));
  const after = ordered.slice(focusedIndex + 1);
  const found = [...after, ...before].find((stop) => needsYou(stop.status));

  if (found === undefined) {
    return null;
  }

  return { space: found.space, tab: found.tab, pane: found.pane };
};
