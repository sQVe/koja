import type { FakePull } from './data.ts';
import type { RailCase, RailState } from './railData.ts';
import { railStates } from './railData.ts';

interface PullNumber {
  title: string;
  pull: number;
}

// The busy stack keeps the base stack's numbers for the PRs both show.
const busyNumbers: PullNumber[] = [
  { title: 'Stack progress and footer', pull: 40 },
  { title: 'Show what PRs need', pull: 38 },
  { title: 'Calm one-line rows', pull: 37 },
  { title: 'Sidebar parts in the kit', pull: 35 },
  { title: 'Remove the narrow rail', pull: 34 },
  { title: 'Space rows in the kit', pull: 33 },
  { title: 'Rename spaces', pull: 31 },
];

const numbered = (pull: FakePull, number: number): FakePull => ({ ...pull, pull: number });

const busyPull = (pull: FakePull): FakePull => {
  const match = busyNumbers.find((candidate) => candidate.title === pull.title);

  return match === undefined ? pull : numbered(pull, match.pull);
};

const { busy } = railStates;

export const spaceStates: Record<RailCase, RailState> = {
  ...railStates,
  busy: {
    ...busy,
    space: { ...busy.space, need: 'failing' },
    pulls: busy.pulls.map(busyPull),
  },
};
