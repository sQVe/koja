import { repositoryOf } from '../src/data/gitIdentity.ts';
import { elementsWithId } from './drawn.ts';
import type { DrawnElement } from './drawn.ts';
import type { FakeView } from './kojaSpacesView.ts';
import { showFacts, space, state, storedFacts } from './kojaSpacesView.ts';
import { pullFacts, readyPull } from './pullFacts.ts';
import { stacksOf } from './stackFixtures.ts';

const repository = repositoryOf(null, '/code/koja/.git');

const stackBranches = ['me-1-low', 'me-2-mid', 'me-3-top'];

const trunkCheckout = { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false };

const topCheckout = {
  folder: '/code/koja-top',
  commonDirectory: '/code/koja/.git',
  linked: true,
  branch: 'me-3-top',
};

const stackCheckouts = [trunkCheckout, topCheckout];

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

export const rowOf = (view: FakeView, id: string): DrawnElement => {
  const [row] = elementsWithId(view.render(), `space-${id}`);

  if (row === undefined) {
    throw new Error(`No drawn row with id ${id}`);
  }

  return row;
};
