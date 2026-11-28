import { repositoryOf } from '../src/data/gitIdentity.ts';
import type { RepositoryIdentity } from '../src/data/gitIdentity.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { RepositoryStacks, TicketFacts } from '../src/data/snapshot.ts';
import { elementsWithId } from './drawn.ts';
import type { DrawnElement } from './drawn.ts';
import type { FakeView } from './kojaSpacesView.ts';
import { showFacts, space, state, storedFacts } from './kojaSpacesView.ts';
import { pullFacts, readyPull } from './pullFacts.ts';
import { stacksOf } from './stackFixtures.ts';

const repository = repositoryOf(null, '/code/koja/.git');

const stackBranches = ['me-1-low', 'me-2-mid', 'me-3-top'];

const stackCheckouts = [
  { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
  {
    folder: '/code/koja-top',
    commonDirectory: '/code/koja/.git',
    linked: true,
    branch: 'me-3-top',
  },
];

const stackPulls = () => [
  pullFacts({
    number: 503,
    headRefName: 'me-1-low',
    checks: { kind: 'read', value: 'failing' },
  }),
  pullFacts({ number: 504, headRefName: 'me-2-mid', state: 'MERGED' }),
  readyPull({ number: 505, headRefName: 'me-3-top' }),
];

export const useStackSpaces = (withStack: boolean): void => {
  const pulls = withStack ? stackPulls() : [];

  const facts = storedFacts(stackCheckouts, {
    [repository.key]: { pulls, failed: false },
  });

  if (withStack) {
    facts.stacks = stacksOf(repository, stackBranches);
  }

  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-top')];
};

const linkCheckouts = [
  {
    folder: '/code/koja',
    commonDirectory: '/code/koja/.git',
    linked: false,
    branch: 'me-4-header',
  },
  {
    folder: '/code/koja-top',
    commonDirectory: '/code/koja/.git',
    linked: true,
    branch: 'me-3-top',
  },
];

// The top branch's own pull is not the pull its stack records, so a fallback to the branch pull
// shows up as the wrong number.
const linkPulls = (): Pull[] => [
  pullFacts({ number: 503, headRefName: 'me-1-low', checks: { kind: 'read', value: 'failing' } }),
  pullFacts({ number: 504, headRefName: 'me-2-mid', state: 'MERGED' }),
  pullFacts({ number: 506, headRefName: 'me-4-header' }),
  readyPull({ number: 999, headRefName: 'me-3-top' }),
  readyPull({ number: 505, headRefName: 'me-3-top' }),
];

const linkStack = (owner: RepositoryIdentity): Record<string, RepositoryStacks> => ({
  [owner.key]: {
    stacks: [
      {
        trunk: 'main',
        branches: [
          { branch: 'me-1-low', pullNumber: 503, restack: 'none' },
          { branch: 'me-2-mid', pullNumber: 504, restack: 'none' },
          { branch: 'me-3-top', pullNumber: 505, restack: 'none' },
        ],
      },
    ],
    failed: false,
  },
});

const linkTicket = (id: string): TicketFacts => ({
  id,
  title: `The ${id} title`,
  state: 'In Progress',
  url: `https://linear.app/koja/issue/${id}`,
  parent: null,
});

// Two spaces with a ticket, a pull, and a branch each, so a space menu can be opened on a row and
// on a project header.
export const useStackLinks = (): void => {
  const facts = storedFacts(linkCheckouts, {
    [repository.key]: { pulls: linkPulls(), failed: false },
  });

  facts.trackers = {
    [repository.key]: {
      workspace: 'koja',
      tickets: { 'ME-3': linkTicket('ME-3'), 'ME-4': linkTicket('ME-4') },
      failed: false,
    },
  };

  facts.stacks = linkStack(repository);

  showFacts(facts);

  state.spaceList = [space('m', true, '/code/koja'), space('w', false, '/code/koja-top')];
};

export const rowOf = (view: FakeView, id: string): DrawnElement => {
  const [row] = elementsWithId(view.render(), `space-${id}`);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  return row;
};
